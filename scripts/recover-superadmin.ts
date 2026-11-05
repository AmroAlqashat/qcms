import 'dotenv/config';
import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SetupModule } from '../src/setup/setup.module';
import { SetupService } from '../src/setup/setup.service';
import { isEmail } from 'class-validator';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

async function ask(label: string, hidden = false): Promise<string> {
  process.stdout.write(label);
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (!hidden) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });

  try {
    return await new Promise<string>((resolve, reject) => {
      rl.once('SIGINT', () => reject(new Error('Cancelled.')));
      rl.once('close', () => reject(new Error('Input closed.')));
      void rl.question('').then(resolve, reject);
    });
  } finally {
    rl.close();
    if (hidden) process.stdout.write('\n');
  }
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
    'Recover a missing superadmin in the database configured by DATABASE_URL.',
  );
  console.log('Existing accounts and roles will not be overwritten.');
  const email = await ask('Admin email: ');
  const fullName = await ask('Full name: ');
  const password = await ask('Password (12–128 characters, hidden): ', true);
  const confirmation = await ask('Confirm password (hidden): ', true);
  if (password !== confirmation) throw new Error('Passwords do not match.');
  const app = await NestFactory.createApplicationContext(SetupModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    await app
      .get(SetupService)
      .recoverSuperadmin({ email, fullName, password });
    try {
      await saveSeedActorEmail(email);
      console.log(
        'Saved SEED_ACTOR_EMAIL in .env. Permissions and missing settings are initialized.',
      );
    } catch {
      console.warn(
        'Admin was created, but .env could not be updated. Do not rerun superadmin:recover.',
      );
      console.warn(
        `Set SEED_ACTOR_EMAIL=${JSON.stringify(email.trim().toLowerCase())} in .env if you need to run settings seeding later.`,
      );
    }
    console.log(
      'Admin created. Sign in at /auth/signIn with the email and password you entered.',
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Prisma errors can include connection details; do not print their raw payload.
    if (error instanceof HttpException && error.getStatus() < 500) {
      console.error(error.message);
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
