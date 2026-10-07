import { ConflictException, Injectable } from '@nestjs/common';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { AuditAction, AuditTarget, Prisma, StaffStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateTempPassword } from './helpers/generate-temp-password.util'
import * as argon2 from 'argon2';

@Injectable()
export class StaffService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) { }

  async inviteStaff(inviteStaffDto: InviteStaffDto) {

    const { email, fullName, jobTitle } = inviteStaffDto;

    const normalizedEmail = email.trim().toLowerCase();

    const existingStaff = await this.prisma.staff.findUnique({
      where: { email: normalizedEmail },
    });

    // Check if the Staff exist and not deleted.
    if (existingStaff && existingStaff.status !== StaffStatus.DELETED) {
      throw new ConflictException(
        'This email already exist.'
      );
    }

    const temporaryPassword = generateTempPassword();

    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });

    const data = {
      email: normalizedEmail,
      passwordHash,
      fullName,
      jobTitle,
      status: StaffStatus.PENDING,
      mustChangePassword: true,
    };

    const select = {
      id: true,
      email: true,
      fullName: true,
      jobTitle: true,
      status: true,
    } satisfies Prisma.StaffSelect;

    type StaffSummary = Prisma.StaffGetPayload<{
      select: typeof select
    }>;

    try {
      return await this.prisma.$transaction(async (tx) => {
        let staff: StaffSummary;

        // Check if the staff exist and deleted
        if (existingStaff && existingStaff.status === StaffStatus.DELETED) {
          // Change the status to pending
          staff = await tx.staff.update({
            // We need the check here too, to prevent another invitation at the same time.
            where: {
              id: existingStaff.id,
              status: StaffStatus.DELETED
            },
            data,
            select,
          });
        } else {
          staff = await tx.staff.create({
            data,
            select,
          });
        }

        await this.audit.record(tx, {
          actorId: 'staff-admin',
          actionType: AuditAction.STAFF_INVITED,
          targetType: AuditTarget.STAFF,
          targetId: staff.id,
          isSuccess: true,
        });

        return { staff, temporaryPassword };
      })
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException({
            message: 'هذا البريد الإلكتروني مسجّل بالفعل',
            errors: { email: 'هذا البريد الإلكتروني مسجّل بالفعل' },
          }
          );
        }

        if (existingStaff && error.code === 'P2025') {
          throw new ConflictException(
            'تغيّر حساب الموظف أثناء الدعوة. حدّث الصفحة وأعد المحاولة'
          )
        }
      }
      throw error
    }
  }
}
