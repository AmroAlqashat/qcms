import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OtpPurpose, Prisma, StaffStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async issueOtp(
    staffId: string,
    purpose: OtpPurpose,
    targetEmail?: string,
    sessionVersion?: number,
  ) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const now = new Date();
    const codeHash = this.hashOtpCode(code);
    let destination: string;
    try {
      destination = await this.prisma.$transaction(
        async (tx) => {
          const staff = await tx.staffMembers.findFirst({
            where: {
              id: staffId,
              isDeleted: false,
              sessionVersion,
              status:
                purpose === OtpPurpose.ONBOARDING
                  ? StaffStatus.PENDING
                  : StaffStatus.ACTIVE,
              mustChangePassword: purpose === OtpPurpose.ONBOARDING,
            },
            select: { email: true },
          });
          if (!staff) throw new NotFoundException('الحساب غير متاح');
          if (purpose === OtpPurpose.EMAIL_CHANGE && !targetEmail) {
            throw new ConflictException('البريد الإلكتروني الجديد مطلوب');
          }
          const email =
            purpose === OtpPurpose.EMAIL_CHANGE ? targetEmail! : staff.email;
          const data = {
            codeHash,
            targetEmail: email,
            expiresAt: new Date(now.getTime() + 5 * 60_000),
            sentAt: now,
            attempts: 0,
          };
          const updated = await tx.oTPs.updateMany({
            where: {
              staffId,
              purpose,
              sentAt: { lte: new Date(now.getTime() - 60_000) },
            },
            data,
          });
          if (!updated.count)
            await tx.oTPs.create({ data: { staffId, purpose, ...data } });
          return email;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        throw new HttpException(
          'انتظر دقيقة قبل طلب رمز جديد',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }
    // Sending email is an external operation, so it must stay outside the DB transaction.
    await this.mail.sendOtp(destination, code);
  }

  async withVerifiedOtp<T>(
    staffId: string,
    purpose: OtpPurpose,
    code: string,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
    targetEmail: string,
  ): Promise<T> {
    const otp = await this.prisma.oTPs.findUnique({
      where: { staffId_purpose: { staffId, purpose } },
    });
    if (
      !otp ||
      otp.targetEmail !== targetEmail ||
      otp.expiresAt <= new Date() ||
      otp.attempts >= 5
    ) {
      throw this.invalidOtp();
    }
    const stored = Buffer.from(otp.codeHash, 'hex');
    const submitted = Buffer.from(this.hashOtpCode(code), 'hex');
    if (
      stored.length !== submitted.length ||
      !timingSafeEqual(stored, submitted)
    ) {
      // Failed attempts must commit even though the request is rejected.
      await this.prisma.oTPs.updateMany({
        where: {
          id: otp.id,
          codeHash: otp.codeHash,
          sentAt: otp.sentAt,
          attempts: { lt: 5 },
        },
        data: { attempts: { increment: 1 } },
      });
      throw this.invalidOtp();
    }
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Only one concurrent request can consume this exact issuance.
          const consumed = await tx.oTPs.deleteMany({
            where: {
              id: otp.id,
              staffId,
              purpose,
              targetEmail,
              codeHash: otp.codeHash,
              sentAt: otp.sentAt,
              expiresAt: { gt: new Date() },
              attempts: { lt: 5 },
            },
          });
          if (consumed.count !== 1) throw this.invalidOtp();
          // A failed account update rolls back successful OTP consumption too.
          return action(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'تغيّرت البيانات أثناء الحفظ. أعد المحاولة.',
        );
      }
      throw error;
    }
  }

  async verifyOnboardingOtp(
    staffId: string,
    code: string,
    sessionVersion: number,
  ) {
    const staff = await this.prisma.staffMembers.findFirst({
      where: {
        id: staffId,
        sessionVersion,
        isDeleted: false,
        status: StaffStatus.PENDING,
        mustChangePassword: true,
      },
      select: { email: true },
    });
    if (!staff) throw new UnauthorizedException('جلسة التحقق غير صالحة');
    await this.withVerifiedOtp(
      staffId,
      OtpPurpose.ONBOARDING,
      code,
      async (tx) => {
        const current = await tx.staffMembers.findFirst({
          where: {
            id: staffId,
            sessionVersion,
            email: staff.email,
            isDeleted: false,
            status: StaffStatus.PENDING,
            mustChangePassword: true,
          },
          select: { id: true },
        });
        if (!current) throw new UnauthorizedException('جلسة التحقق غير صالحة');
      },
      staff.email,
    );
  }

  private invalidOtp() {
    return new UnprocessableEntityException({
      message:
        'رمز التحقق غير صحيح أو منتهي الصلاحية. اطلب رمزًا جديدًا عند الحاجة.',
      errors: {
        otp: 'تحقق من الرمز؛ صلاحيته خمس دقائق وبحد أقصى خمس محاولات.',
      },
    });
  }

  private hashOtpCode(code: string) {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('OTP_HASH_SECRET'),
    )
      .update(code)
      .digest('hex');
  }
}
