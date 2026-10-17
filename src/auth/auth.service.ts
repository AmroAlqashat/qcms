import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { AuditAction, AuditTarget, Prisma, StaffStatus } from '@prisma/client';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeOnboardingPasswordDto } from './dto/change-onboarding-password.dto';
import { CompleteOnboardingProfileDto } from './dto/complete-onboarding-profile.dto';
import { SignInDto } from './dto/auth.signIn.dto';

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const ONBOARDING_TOKEN_TTL = '15m';

export type OnboardingStage =
  'verify-otp' | 'change-password' | 'complete-profile';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jwtService: JwtService,
  ) {}

  async signInHelper(signInDto: SignInDto) {
    const staff = await this.prisma.staff.findUnique({
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        mustChangePassword: true,
      },
      where: { email: signInDto.email.trim().toLowerCase() },
    });

    if (
      !staff ||
      !(await this.verifyPassword(staff.passwordHash, signInDto.password))
    ) {
      throw new UnauthorizedException('bad credentials');
    }

    if (staff.status === StaffStatus.PENDING) {
      if (!staff.mustChangePassword) {
        throw new UnauthorizedException('Pending account state is invalid');
      }
      await this.issueOnboardingOtp(staff.id, staff.email);
      return this.createOnboardingResult(staff.id, 'verify-otp');
    }

    if (staff.status !== StaffStatus.ACTIVE) {
      throw new UnauthorizedException('bad credentials');
    }

    if (staff.mustChangePassword) {
      return this.createOnboardingResult(staff.id, 'change-password');
    }

    return {
      kind: 'signed-in' as const,
      ...(await this.createSessionTokens(staff.id)),
    };
  }

  async verifyOnboardingOtp(staffId: string, code: string) {
    const [staff, otp] = await Promise.all([
      this.prisma.staff.findUnique({
        where: { id: staffId },
        select: { status: true, mustChangePassword: true },
      }),
      this.prisma.oTP.findUnique({ where: { staffId } }),
    ]);

    if (
      !staff ||
      staff.status !== StaffStatus.PENDING ||
      !staff.mustChangePassword ||
      !otp
    ) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }
    if (otp.expiresAt.getTime() <= Date.now()) {
      await this.prisma.oTP.deleteMany({ where: { id: otp.id } });
      throw new UnauthorizedException('Invalid or expired verification code');
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw this.tooManyAttempts();
    }

    const submittedHash = this.hashOtp(code);
    const storedHash = Buffer.from(otp.codeHash, 'hex');
    const submittedHashBytes = Buffer.from(submittedHash, 'hex');
    const valid =
      storedHash.length === submittedHashBytes.length &&
      timingSafeEqual(storedHash, submittedHashBytes);

    if (!valid) {
      const updated = await this.prisma.oTP.updateMany({
        where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw this.tooManyAttempts();
      }
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    const consumed = await this.prisma.oTP.deleteMany({
      where: {
        id: otp.id,
        codeHash: otp.codeHash,
        attempts: { lt: OTP_MAX_ATTEMPTS },
        expiresAt: { gt: new Date() },
      },
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('Invalid or expired verification code');
    }

    return this.createOnboardingResult(staffId, 'change-password');
  }

  async changeOnboardingPassword(
    staffId: string,
    dto: ChangeOnboardingPasswordDto,
  ) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new ConflictException('Password confirmation does not match');
    }

    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });

    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: { status: true, mustChangePassword: true },
    });
    if (!staff || !staff.mustChangePassword) {
      throw new UnauthorizedException('Password change is not required');
    }

    if (
      staff.status !== StaffStatus.PENDING &&
      staff.status !== StaffStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Password change is not allowed');
    }

    if (staff.status === StaffStatus.PENDING) {
      const changed = await this.prisma.staff.updateMany({
        where: {
          id: staffId,
          status: StaffStatus.PENDING,
          mustChangePassword: true,
        },
        data: { passwordHash },
      });
      if (changed.count !== 1) {
        throw new ConflictException('The account state has changed');
      }
      return this.createOnboardingResult(staffId, 'complete-profile');
    }

    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.staff.updateMany({
        where: {
          id: staffId,
          status: StaffStatus.ACTIVE,
          mustChangePassword: true,
        },
        data: { passwordHash, mustChangePassword: false },
      });
      if (changed.count !== 1) {
        throw new ConflictException('The account state has changed');
      }
      await this.audit.record(tx, {
        actorId: staffId,
        actionType: AuditAction.STAFF_ONBOARDING_COMPLETED,
        targetType: AuditTarget.STAFF,
        targetId: staffId,
        isSuccess: true,
      });
    });

    return {
      kind: 'signed-in' as const,
      ...(await this.createSessionTokens(staffId)),
    };
  }

  async completePendingOnboarding(
    staffId: string,
    profile: CompleteOnboardingProfileDto,
  ) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.staff.updateMany({
          where: {
            id: staffId,
            status: StaffStatus.PENDING,
            mustChangePassword: true,
          },
          data: {
            fullName: profile.fullName.trim(),
            jobTitle: profile.jobTitle.trim(),
            nationalId: profile.nationalId?.trim() || null,
            phone: profile.phone?.trim() || null,
            dateOfBirth: profile.dateOfBirth ?? null,
            status: StaffStatus.ACTIVE,
            mustChangePassword: false,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('The account state has changed');
        }
        await tx.oTP.deleteMany({ where: { staffId } });
        await this.audit.record(tx, {
          actorId: staffId,
          actionType: AuditAction.STAFF_ONBOARDING_COMPLETED,
          targetType: AuditTarget.STAFF,
          targetId: staffId,
          isSuccess: true,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A unique staff value is already in use');
      }
      throw error;
    }

    return {
      kind: 'signed-in' as const,
      ...(await this.createSessionTokens(staffId)),
    };
  }

  async getOnboardingProfile(staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: {
        id: staffId,
        status: StaffStatus.PENDING,
        mustChangePassword: true,
      },
      select: {
        fullName: true,
        jobTitle: true,
        nationalId: true,
        phone: true,
        dateOfBirth: true,
      },
    });
    if (!staff) {
      throw new UnauthorizedException('Onboarding is not available');
    }
    return {
      ...staff,
      dateOfBirth: staff.dateOfBirth?.toISOString().slice(0, 10) ?? '',
    };
  }

  private async verifyPassword(passwordHash: string, password: string) {
    if (passwordHash.startsWith('$argon2')) {
      return argon2.verify(passwordHash, password);
    }
    return bcrypt.compare(password, passwordHash);
  }

  private async issueOnboardingOtp(staffId: string, email: string) {
    const now = new Date();
    const existing = await this.prisma.oTP.findUnique({ where: { staffId } });
    if (
      existing &&
      existing.expiresAt > now &&
      existing.sentAt.getTime() + OTP_RESEND_COOLDOWN_MS > now.getTime()
    ) {
      if (existing.attempts >= OTP_MAX_ATTEMPTS) {
        throw this.tooManyAttempts();
      }
      return;
    }
    if (
      existing &&
      existing.expiresAt > now &&
      existing.attempts >= OTP_MAX_ATTEMPTS
    ) {
      throw this.tooManyAttempts();
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = this.hashOtp(code);
    const attempts =
      existing && existing.expiresAt > now ? existing.attempts : 0;
    await this.prisma.oTP.upsert({
      where: { staffId },
      create: {
        staffId,
        id: randomUUID(),
        codeHash,
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
        sentAt: now,
        attempts,
      },
      update: {
        id: randomUUID(),
        codeHash,
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
        sentAt: now,
        attempts,
      },
    });

    this.simulateOtpEmail(email, code);
  }

  private simulateOtpEmail(email: string, code: string) {
    console.info(
      `[OTP email simulation] To: ${email}; verification code: ${code}`,
    );
  }

  private hashOtp(code: string) {
    const secret = process.env.JWT_SECRET_KEY;
    if (!secret) {
      throw new Error('JWT_SECRET_KEY is not configured');
    }
    return createHmac('sha256', secret).update(code).digest('hex');
  }

  private tooManyAttempts() {
    return new HttpException(
      'Too many verification attempts',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async createOnboardingResult(
    staffId: string,
    stage: OnboardingStage,
  ) {
    const token = await this.jwtService.signAsync(
      { sub: staffId, tokenUse: 'onboarding', stage },
      { expiresIn: ONBOARDING_TOKEN_TTL },
    );
    return { kind: 'onboarding' as const, stage, token };
  }

  private async createSessionTokens(staffId: string) {
    const claims = { sub: staffId };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({ ...claims, tokenUse: 'access' }),
      this.jwtService.signAsync(
        { ...claims, tokenUse: 'refresh' },
        { expiresIn: '7d' },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}
