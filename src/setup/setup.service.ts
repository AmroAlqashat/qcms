import {
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import { isEmail } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { initializeSuperadmin } from './helpers/initialize-superadmin';

import { SetupDto } from './dto/setup.dto';
import { RecoverSuperadminDto } from './dto/recover-superadmin.dto';
import { MAX_SETUP_ATTEMPTS, hashSetupToken } from './helpers/setup-token';

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  // Operator-only entry point: no controller exposes recovery over HTTP.
  async recoverSuperadmin(details: RecoverSuperadminDto): Promise<void> {
    const email = details.email.trim().toLowerCase();
    const fullName = details.fullName.trim();
    if (!isEmail(email) || email.length > 254)
      throw new BadRequestException('Enter a valid email.');
    if (fullName.length < 2 || fullName.length > 100)
      throw new BadRequestException('Full name must be 2–100 characters.');
    if (details.password.length < 8 || details.password.length > 128)
      throw new BadRequestException('Password must be 8–128 characters.');
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
        await initializeSuperadmin(tx, { email, fullName, passwordHash }, true);
      },
      { timeout: 30_000 },
    );
  }

  async getSetupStatus(): Promise<{ needsSetup: boolean; available: boolean }> {
    const state = await this.prisma.systemSetups.findUnique({
      where: { id: 1 },
    });

    // A missing setup row is possible after clearing development data.
    const needsSetup =
      !state?.completedAt && (await this.prisma.staffMembers.count()) === 0;

    const available =
      needsSetup &&
      !!state?.tokenHash &&
      !!state.tokenExpiresAt &&
      state.tokenExpiresAt > new Date() &&
      state.failedAttempts < MAX_SETUP_ATTEMPTS;

    return { needsSetup, available };
  }

  // Operator-only entry point; the script handles terminal input and output.
  async issueSetupToken(): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetups.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM "SystemSetups" WHERE id = 1 FOR UPDATE`;
      const state = await tx.systemSetups.findUniqueOrThrow({
        where: { id: 1 },
      });
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
    return token;
  }

  async completeSetup(setupDto: SetupDto): Promise<void> {
    try {
      const completed = await this.prisma.$transaction(
        async (tx) => {
          const state = await tx.systemSetups.findUnique({
            where: { id: 1 },
          });
          if (
            !state ||
            state.completedAt ||
            !state.tokenHash ||
            !state.tokenExpiresAt ||
            state.tokenExpiresAt <= new Date() ||
            state.failedAttempts >= MAX_SETUP_ATTEMPTS ||
            (await tx.staffMembers.count())
          )
            return false;

          const expected = Buffer.from(state.tokenHash, 'hex');
          const actual = Buffer.from(hashSetupToken(setupDto.token), 'hex');
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
          const passwordHash = await argon2.hash(setupDto.password, {
            type: argon2.argon2id,
          });
          await initializeSuperadmin(tx, {
            email: setupDto.email.trim().toLowerCase(),
            fullName: setupDto.fullName.trim(),
            passwordHash,
          });
          return true;
        },
        {
          timeout: 30_000,
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
      // Throw only after the transaction commits failed-attempt increments.
      if (!completed) {
        throw new ForbiddenException(
          'رمز الإعداد غير صالح أو انتهت صلاحيته أو أغلق الإعداد. تواصل مع مسؤول التثبيت.',
        );
      }
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002')
          throw new ConflictException(
            'تعذر إكمال الإعداد. تحقق من حالة النظام.',
          );
        if (error.code === 'P2034')
          throw new ConflictException(
            'يجري إكمال الإعداد الآن. حاول مرة أخرى بعد قليل.',
          );
      }
      throw error;
    }
  }
}
