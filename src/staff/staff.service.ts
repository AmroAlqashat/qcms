import { ConflictException, Injectable } from '@nestjs/common';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { AuditAction, AuditTarget, Prisma, StaffStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateTempPassword } from './utils/generate-temp-password.util'
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
    }

    const select = {
      id: true,
      email: true,
      fullName: true,
      jobTitle: true,
      status: true,
    }

    try {
      // Check if the staff exist and deleted
      if (existingStaff && existingStaff.status === StaffStatus.DELETED) {
        // Change the status to pending
        const reinvitedStaff = await this.prisma.staff.update({
          // We need the check here too, to prevent another invitation at the same time.
          where: {
            id: existingStaff.id,
            status: StaffStatus.DELETED
          },
          data,
          select,
        });

        return { staff: reinvitedStaff, temporaryPassword };
      }

      const newStaff = await this.prisma.staff.create({
        data,
        select,
      });
      
      await this.audit.record(this.prisma, {
        actorId: 'staff-admin',
        actionType: AuditAction.STAFF_CREATED,
        targetType: AuditTarget.STAFF,
        targetId: newStaff.id,
        isSuccess: true,
      });

      return { staff: newStaff, temporaryPassword }

    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            'A staff exist with these unique details.'
          );
        }

        if (existingStaff && error.code === 'P2025') {
          throw new ConflictException(
            'This staff account changed during the invitation. Refresh and try again.'
          )
        }
      }
      throw error
    }
  }
}
