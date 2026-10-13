import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { AuditAction, AuditTarget, Prisma, StaffStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateTempPassword } from './helpers/generate-temp-password.util'
import * as argon2 from 'argon2';
import { FilteredStaffDto } from './dto/filter-staff.dto';


@Injectable()
export class StaffService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) { }

  async showFilteredStaff(filterDto: FilteredStaffDto){
    const {searchField, status, halaqa, role, page, limit} = filterDto;
    const skip = (page! - 1) * limit!;

    //validate foreign keys
    await this.validateRelations(halaqa, role);

    const where: Prisma.StaffWhereInput = {};

    //define search parameters
    if(searchField){
      where.OR = [
        {fullName: {contains: searchField, mode: 'insensitive'}},
        {jobTitle: {contains: searchField, mode: 'insensitive'}}
      ]
    }
    if(status)
      where.status = status;
    else
      where.status = { not: StaffStatus.PENDING };
    if(halaqa)
      where.classAssignments = {some: {halaqaId: halaqa}}
    if(role)
      where.roleGrants = {some: {roleId: role}}
    //search
    return this.prisma.staff.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });
  }

  async showStaffFilterOptions(selectedHalaqaId?: string, selectedRoleId?: string) {
    const [classes, templates] = await Promise.all([
      this.prisma.halaqa.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.role.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      classes: classes.map((item) => ({
        ...item,
        selected: item.id === selectedHalaqaId,
      })),
      templates: templates.map((item) => ({
        ...item,
        selected: item.id === selectedRoleId,
      })),
    };
  }

  private async validateRelations(halaqaId?: string, roleId?: string): Promise<void> {
    if (halaqaId) {
      const classExists = await this.prisma.halaqa.findUnique({
        where: { id: halaqaId },
        select: { id: true },
      });
      if (!classExists) throw new BadRequestException(`Class ID "${halaqaId}" does not exist.`);
    }

    if (roleId) {
      const roleExists = await this.prisma.role.findUnique({
        where: { id: roleId },
        select: { id: true },
      });
      if (!roleExists) throw new BadRequestException(`Role ID "${roleId}" does not exist.`);
    }
  }

  async showOneStaff(staffId: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        fullName: true,
        email: true,
        jobTitle: true,
        status: true,
        dateOfBirth: true,
        nationalId: true,
        phone: true,
        classAssignments: {
          select: {
            halaqa: {
              select: { id: true, name: true },
            },
          },
        },
        activityAssignments: {
          select: {
            activity: {
              select: { id: true, name: true },
            },
          },
        },
        roleGrants: {
          where: { revokedAt: null },
          select: {
            role: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!staff) {
      throw new NotFoundException('الموظف غير موجود');
    }

    return staff;
  }

  async showPendingStaff() {
    const staff = await this.prisma.staff.findMany({
      where: { status: 'PENDING', mustChangePassword: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        jobTitle: true,
        status: true,
      },
    });

    return staff;
  }

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
          actorId: 'staff_admin',
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
