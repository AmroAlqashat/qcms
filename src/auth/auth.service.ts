import { jobTitleLabels } from '../common/job-title-labels-map';
import { AuditAction, AuditTarget, Prisma, StaffStatus } from '@prisma/client';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeOnboardingPasswordDto } from './dto/change-onboarding-password.dto';
import { CompleteOnboardingProfileDto } from './dto/complete-onboarding-profile.dto';
import { SignInDto } from './dto/auth.signIn.dto';
import { saveSession, regenerateSession } from './helpers/sessions.helpers';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async signIn(signInDto: SignInDto, request: Request) {
    const { email, password } = signInDto;
    const normalizedEmail = email.trim().toLowerCase();

    const staff = await this.prisma.staffMembers.findUnique({
      where: { email: normalizedEmail, isDeleted: false },
      select: {
        id: true,
        passwordHash: true,
        sessionVersion: true,
        status: true,
        mustChangePassword: true,
      },
    });

    if (
      !staff ||
      !staff.passwordHash ||
      !(await argon2.verify(staff.passwordHash, password))
    ) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }

    // Normal login
    if (staff.status === StaffStatus.ACTIVE && !staff.mustChangePassword) {
      await regenerateSession(request);

      request.session.staffId = staff.id;
      request.session.sessionVersion = staff.sessionVersion;
      request.session.loggedInAt = Date.now();

      await saveSession(request);
      return `/staff/${staff.id}`;
    }

    // Onboarding
    if (staff.status === StaffStatus.PENDING && staff.mustChangePassword) {
      await regenerateSession(request);

      request.session.onboardingStep = {
        staffId: staff.id,
        sessionVersion: staff.sessionVersion,
        step: 'VERIFY_OTP',
        startedAt: Date.now(),
      };

      await saveSession(request);
      return '/auth/onboarding/verify-otp';
    }

    throw new UnauthorizedException('بيانات الدخول غير صحيحة');
  }

  async getOnboardingProfile(staffId: string) {
    const staff = await this.prisma.staffMembers.findFirst({
      where: {
        id: staffId,
        status: StaffStatus.PENDING,
        isDeleted: false,
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
      throw new UnauthorizedException('استكمال الحساب غير متاح');
    }

    return {
      ...staff,
      jobTitleLabel: staff.jobTitle
        ? jobTitleLabels[staff.jobTitle]
        : 'غير محدد',
      dateOfBirth: staff.dateOfBirth?.toISOString().slice(0, 10) ?? '',
    };
  }

  async completeOnboardingProfile(
    staffId: string,
    profile: CompleteOnboardingProfileDto,
    sessionVersion: number,
  ) {
    const fullName = profile.fullName.trim();
    const nationalId = profile.nationalId?.trim();
    const phone = profile.phone?.trim();

    if (!fullName || !nationalId || !phone || !profile.dateOfBirth) {
      throw new UnprocessableEntityException({
        message: 'أكمل جميع البيانات المطلوبة',
        errors: { profile: 'أكمل جميع البيانات المطلوبة' },
      });
    }

    try {
      const updated = await this.prisma.staffMembers.updateMany({
        where: {
          id: staffId,
          sessionVersion,
          status: StaffStatus.PENDING,
          isDeleted: false,
          mustChangePassword: true,
        },
        data: {
          fullName,
          nationalId,
          phone,
          dateOfBirth: profile.dateOfBirth,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'تغيّرت حالة الحساب. أعد تسجيل الدخول وحاول مرة أخرى',
        );
      }
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'الرقم الوطني مستخدم بالفعل',
          errors: { nationalId: 'الرقم الوطني مستخدم بالفعل' },
        });
      }

      throw error;
    }
  }

  async changeOnboardingPassword(
    staffId: string,
    changeOnboardingPasswordDto: ChangeOnboardingPasswordDto,
    sessionVersion: number,
  ) {
    const { newPassword } = changeOnboardingPasswordDto;

    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId, isDeleted: false, sessionVersion },
      select: {
        status: true,
        mustChangePassword: true,
        passwordHash: true,
        sessionVersion: true,
        fullName: true,
        jobTitle: true,
        nationalId: true,
        phone: true,
        dateOfBirth: true,
      },
    });

    if (
      !staff ||
      !staff.passwordHash ||
      staff.status !== StaffStatus.PENDING ||
      !staff.mustChangePassword
    ) {
      throw new UnauthorizedException('لا يمكن تغيير كلمة المرور');
    }

    if (
      !staff.fullName ||
      !staff.jobTitle ||
      !staff.nationalId ||
      !staff.phone ||
      !staff.dateOfBirth
    ) {
      throw new ConflictException('يجب إكمال الملف الشخصي أولًا');
    }

    if (await argon2.verify(staff.passwordHash, newPassword)) {
      throw new UnprocessableEntityException({
        message: 'اختر كلمة مرور مختلفة عن كلمة المرور المؤقتة',
        errors: {
          newPassword: 'اختر كلمة مرور مختلفة عن كلمة المرور المؤقتة',
        },
      });
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.staffMembers.updateMany({
        where: {
          id: staffId,
          sessionVersion,
          status: StaffStatus.PENDING,
          isDeleted: false,
          mustChangePassword: true,
        },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
          mustChangePassword: false,
          status: StaffStatus.ACTIVE,
        },
      });

      if (changed.count !== 1) {
        throw new ConflictException(
          'تغيّرت حالة الحساب. أعد تسجيل الدخول وحاول مرة أخرى',
        );
      }

      await this.audit.record(tx, {
        actorId: staffId,
        actionType: AuditAction.STAFF_ONBOARDING_COMPLETED,
        targetType: AuditTarget.STAFF,
        targetId: staffId,
        isSuccess: true,
      });
      await tx.oTPs.deleteMany({ where: { staffId } });
      return sessionVersion + 1;
    });
  }
}
