import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import { isEmail } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { initializeOwner } from './initialize-owner';

export const MAX_SETUP_ATTEMPTS = 10;
export const hashSetupToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  // Operator-only entry point: no controller exposes recovery over HTTP.
  async recoverSuperadmin(details: {
    email: string;
    fullName: string;
    password: string;
  }): Promise<void> {
    const email = details.email.trim().toLowerCase();
    const fullName = details.fullName.trim();
    if (!isEmail(email) || email.length > 254)
      throw new BadRequestException('Enter a valid email.');
    if (fullName.length < 2 || fullName.length > 100)
      throw new BadRequestException('Full name must be 2–100 characters.');
    if (details.password.length < 12 || details.password.length > 128)
      throw new BadRequestException('Password must be 12–128 characters.');
    const passwordHash = await argon2.hash(details.password, {
      type: argon2.argon2id,
    });
    await this.prisma.$transaction(
      async (tx) => {
        await tx.systemSetups.upsert({
          where: { id: 1 },
          create: { id: 1 },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM "SystemSetups" WHERE id = 1 FOR UPDATE`;
        if (await tx.staffMembers.count({ where: { isSuperAdmin: true } }))
          throw new ConflictException(
            'A superadmin already exists. This command never replaces or resets an existing owner.',
          );
        if (
          await tx.staffMembers.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true },
          })
        )
          throw new ConflictException(
            'This email already exists. No account was changed.',
          );
        await initializeOwner(tx, { email, fullName, passwordHash }, true);
      },
      { timeout: 30_000 },
    );
  }

  // A missing setup row is possible after clearing development data.
  // Staff or a completion marker always prevent reopening initial setup.
  async needsInitialSetup(): Promise<boolean> {
    const state = await this.prisma.systemSetups.findUnique({
      where: { id: 1 },
    });
    return (
      !state?.completedAt && (await this.prisma.staffMembers.count()) === 0
    );
  }

  async available() {
    const state = await this.prisma.systemSetups.findUnique({
      where: { id: 1 },
    });
    return (
      !!state &&
      !state.completedAt &&
      !!state.tokenHash &&
      !!state.tokenExpiresAt &&
      state.tokenExpiresAt > new Date() &&
      state.failedAttempts < MAX_SETUP_ATTEMPTS &&
      !(await this.prisma.staffMembers.count())
    );
  }

  async complete(details: {
    token: string;
    email: string;
    fullName: string;
    password: string;
  }) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Lock the singleton across all app instances. NOWAIT avoids queuing expensive requests.
          const rows = await tx.$queryRaw<
            Array<{ id: number }>
          >`SELECT id FROM "SystemSetups" WHERE id = 1 FOR UPDATE NOWAIT`;
          if (!rows.length) return false;
          const state = await tx.systemSetups.findUniqueOrThrow({
            where: { id: 1 },
          });
          if (
            state.completedAt ||
            !state.tokenHash ||
            !state.tokenExpiresAt ||
            state.tokenExpiresAt <= new Date() ||
            state.failedAttempts >= MAX_SETUP_ATTEMPTS ||
            (await tx.staffMembers.count())
          )
            return false;
          const expected = Buffer.from(state.tokenHash, 'hex');
          const actual = Buffer.from(hashSetupToken(details.token), 'hex');
          if (
            expected.length !== actual.length ||
            !timingSafeEqual(expected, actual)
          ) {
            // Return instead of throwing so the failed-attempt counter commits.
            await tx.systemSetups.update({
              where: { id: 1 },
              data: { failedAttempts: { increment: 1 } },
            });
            return false;
          }
          const passwordHash = await argon2.hash(details.password, {
            type: argon2.argon2id,
          });
          await initializeOwner(tx, {
            email: details.email.trim().toLowerCase(),
            fullName: details.fullName.trim(),
            passwordHash,
          });
          return true;
        },
        { timeout: 30_000 },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException(
            'تعذر إكمال الإعداد. تحقق من حالة النظام.',
          );
        if (error.code === 'P2010' && error.meta?.code === '55P03')
          throw new ServiceUnavailableException(
            'يجري إكمال الإعداد الآن. حاول مرة أخرى بعد قليل.',
          );
      }
      throw error;
    }
  }
}
