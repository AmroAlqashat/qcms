import 'dotenv/config';
import { Prisma, PrismaClient, StaffStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { isEmail } from 'class-validator';
import { createInterface } from 'node:readline/promises';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const roleName = 'Bootstrap Administrator';

async function ask(label: string, hidden = false): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  if (hidden) {
    // Suppress echoing of typed characters (including pasted text)
    // @ts-expect-error – private API, intentional for password masking
    rl._writeToOutput = (str: string) => {
      if (str.includes('\n') || str.includes('\r')) {
        // @ts-expect-error
        rl.output.write(str);
      }
      // otherwise swallow the character
    };
  }

  try {
    return await new Promise<string>((resolve, reject) => {
      rl.once('SIGINT', () => reject(new Error('Cancelled.')));
      rl.once('close', () => reject(new Error('Input closed.')));
      void rl.question(label).then(resolve, reject);
    });
  } finally {
    rl.close();
    if (hidden) process.stdout.write('\n');
  }
}

export async function createAdmin(
  prisma: PrismaClient,
  details: { email: string; fullName: string; password: string },
): Promise<void> {
  const email = details.email.trim().toLowerCase();
  const fullName = details.fullName.trim();
  if (!isEmail(email) || email.length > 254)
    throw new Error('Enter a valid email.');
  if (fullName.length < 2 || fullName.length > 100)
    throw new Error('Full name must be 2–100 characters.');
  if (details.password.length < 12 || details.password.length > 128)
    throw new Error('Password must be 12–128 characters.');
  const passwordHash = await argon2.hash(details.password, {
    type: argon2.argon2id,
  });
  await prisma.$transaction(
    async (tx) => {
      const existing = await tx.staffMembers.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing)
        throw new Error('This email already exists. No account was changed.');
      if (
        await tx.roles.findUnique({
          where: { name: roleName },
          select: { id: true },
        })
      ) {
        throw new Error(
          'The bootstrap admin role already exists. Use staff management for further administrators.',
        );
      }
      const permissions = await tx.permissions.findMany({
        select: { id: true, allowedScopes: true },
      });
      if (
        !permissions.length ||
        permissions.some((permission) => !permission.allowedScopes.length)
      ) {
        throw new Error(
          'The permission catalog is empty or incomplete. Populate it before creating the admin.',
        );
      }
      // A dedicated role avoids changing privileges for any existing role members.
      const role = await tx.roles.create({
        data: {
          name: roleName,
          description:
            'Initial administrator with all permissions available at bootstrap time.',
          rolePermissions: {
            create: permissions.flatMap((permission) =>
              permission.allowedScopes.map((scopeType) => ({
                permissionId: permission.id,
                scopeType,
              })),
            ),
          },
        },
      });
      const staff = await tx.staffMembers.create({
        data: {
          email,
          fullName,
          jobTitle: 'Administrator',
          passwordHash,
          status: StaffStatus.ACTIVE,
          mustChangePassword: false,
        },
      });
      await tx.roleStaffAssignments.create({
        data: { staffId: staff.id, roleId: role.id, grantedById: staff.id },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

// Update only the seed actor; write atomically so a failed write leaves .env intact.
export async function saveSeedActorEmail(
  email: string,
  envPath = resolve('.env'),
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!isEmail(normalizedEmail) || /[\r\n]/.test(normalizedEmail)) {
    throw new Error('Invalid seed actor email.');
  }
  const contents = await readFile(envPath, 'utf8');
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const assignment = `SEED_ACTOR_EMAIL=${JSON.stringify(normalizedEmail)}`;
  const pattern = /^[ \t]*(?:export[ \t]+)?SEED_ACTOR_EMAIL[ \t]*=[^\r\n]*/gm;
  const updated = pattern.test(contents)
    ? contents.replace(pattern, () => assignment)
    : contents +
      (contents && !contents.endsWith('\n') ? newline : '') +
      assignment +
      newline;
  const temporaryPath = `${envPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, updated, { mode: 0o600, flag: 'wx' });
    await rename(temporaryPath, envPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Run this command in an interactive terminal.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  console.log(
    'Create the initial administrator in the database configured by DATABASE_URL.',
  );
  console.log('Existing accounts and roles will not be overwritten.');
  const email = await ask('Admin email: ');
  const fullName = await ask('Full name: ');
  const password = await ask('Password (12–128 characters, hidden): ', true);
  const confirmation = await ask('Confirm password (hidden): ', true);
  if (password !== confirmation) throw new Error('Passwords do not match.');
  const prisma = new PrismaClient();
  try {
    await createAdmin(prisma, { email, fullName, password });
    try {
      await saveSeedActorEmail(email);
      console.log(
        'Saved SEED_ACTOR_EMAIL in .env. Next: npm run seed:settings',
      );
    } catch {
      console.warn(
        'Admin was created, but .env could not be updated. Do not rerun admin:create.',
      );
      console.warn(
        `Set SEED_ACTOR_EMAIL=${JSON.stringify(email.trim().toLowerCase())} in .env, then run npm run seed:settings.`,
      );
    }
    console.log(
      'Admin created. Sign in at /auth/signIn with the email and password you entered.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Prisma errors can include connection details; do not print their raw payload.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(
        `Creation failed (${error.code}). No partial account or role was saved.`,
      );
    } else if (error instanceof Error && error.constructor === Error) {
      console.error(error.message);
    } else {
      console.error(
        'Creation failed. Check the database connection and migrations.',
      );
    }
    process.exitCode = 1;
  });
}
