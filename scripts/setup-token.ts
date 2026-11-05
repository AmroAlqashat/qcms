import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashSetupToken } from '../src/setup/setup.service';

const prisma = new PrismaClient();
async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      'Run interactively; do not send setup tokens to deployment logs.',
    );
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await prisma.$transaction(async (tx) => {
    await tx.systemSetups.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    await tx.$queryRaw`SELECT id FROM "SystemSetups" WHERE id = 1 FOR UPDATE`;
    const state = await tx.systemSetups.findUniqueOrThrow({ where: { id: 1 } });
    if (state.completedAt || (await tx.staffMembers.count()))
      throw new Error(
        'Setup is closed: this installation already has staff or completed setup. Use controlled recovery if needed.',
      );
    await tx.systemSetups.update({
      where: { id: 1 },
      data: {
        tokenHash: hashSetupToken(token),
        tokenExpiresAt: expiresAt,
        failedAttempts: 0,
      },
    });
  });
  console.log(
    'Open /setup over HTTPS and provide this token privately to the center owner.',
  );
  console.log(
    'Any previous setup token is now invalid. Expires in 30 minutes:',
  );
  console.log(token);
}
main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error && error.constructor === Error
        ? error.message
        : 'Token creation failed. Check database access and migrations.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
