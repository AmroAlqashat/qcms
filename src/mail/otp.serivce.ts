import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, StaffStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async issueOtp(staffId: string) {
    // Check if staff exist and get the email.
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId },
      select: { email: true },
    });

    if (!staff) {
      throw new NotFoundException('لم يتم العثور على الموظف');
    }

    // Generate the OTP
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const now = new Date();

    const otpData = {
      codeHash: this.hashOtpCode(code),
      expiresAt: new Date(now.getTime() + 5 * 60_000), // 5 minutes
      sentAt: now,
      attempts: 0,
    };

    // An existing code can only be replaced after one minute.
    const updated = await this.prisma.oTPs.updateMany({
      where: {
        staffId,
        sentAt: { lte: new Date(now.getTime() - 60_000) }, // 1 minute wait time for each otp code
      },
      data: otpData,
    });

    if (updated.count === 0) {
      try {
        await this.prisma.oTPs.create({
          data: { staffId, ...otpData },
        });
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new HttpException(
            'انتظر دقيقة قبل طلب رمز جديد',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        throw error;
      }
    }

    // Add await to it when implementing real send otp.
    this.mail.sendOtp(staff.email, code);
  }

  verifyOtp(dbCodeHash: string, code: string) {
    const userCodeHash = this.hashOtpCode(code);

    const stored = Buffer.from(dbCodeHash, 'hex');
    const submitted = Buffer.from(userCodeHash, 'hex');

    return (
      stored.length === submitted.length && timingSafeEqual(stored, submitted)
    );
  }

  async verifyOnboardingOtp(staffId: string, code: string) {
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId },
      select: {
        status: true,
        mustChangePassword: true,
      },
    });

    if (
      !staff ||
      staff.status !== StaffStatus.PENDING ||
      !staff.mustChangePassword
    ) {
      throw new UnauthorizedException('جلسة التحقق غير صالحة');
    }

    const staffOtp = await this.prisma.oTPs.findUnique({
      where: { staffId },
      select: {
        id: true,
        codeHash: true,
        expiresAt: true,
        attempts: true,
      },
    });

    if (!staffOtp) {
      throw new UnprocessableEntityException({
        message: 'لا يوجد رمز تحقق',
        errors: { code: 'اطلب رمز تحقق جديدًا' },
      });
    }

    if (staffOtp.expiresAt <= new Date()) {
      throw new UnprocessableEntityException({
        message: 'رمز التحقق منتهي الصلاحية',
        errors: { code: 'رمز التحقق منتهي الصلاحية' },
      });
    }

    if (staffOtp.attempts >= 5) {
      throw new UnprocessableEntityException({
        message: 'لقد تعديت خمس محاولات، اطلب رمزًا آخر',
        errors: { code: 'لقد تعديت خمس محاولات، اطلب رمزًا آخر' },
      });
    }

    if (!this.verifyOtp(staffOtp.codeHash, code)) {
      await this.prisma.oTPs.updateMany({
        where: {
          id: staffOtp.id,
          codeHash: staffOtp.codeHash,
          attempts: { lt: 5 },
        },
        data: {
          attempts: { increment: 1 },
        },
      });

      throw new UnprocessableEntityException({
        message: 'رمز التحقق غير صحيح',
        errors: { code: 'رمز التحقق غير صحيح' },
      });
    }

    const deleted = await this.prisma.oTPs.deleteMany({
      where: {
        id: staffOtp.id,
        staffId,
        codeHash: staffOtp.codeHash,
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 },
      },
    });

    if (deleted.count !== 1) {
      throw new UnprocessableEntityException({
        message: 'تعذر التحقق من الرمز، حاول مرة أخرى',
        errors: { code: 'تعذر التحقق من الرمز، حاول مرة أخرى' },
      });
    }
  }

  hashOtpCode(code: string) {
    const secret = this.config.getOrThrow<string>('OTP_HASH_SECRET');
    const codeHash = createHmac('sha256', secret).update(code).digest('hex');

    return codeHash;
  }
}
