import {
  jobTitleLabels,
  jobTitleOptions,
} from '../common/job-title-labels-map';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InviteStaffDto } from './dto/invite-staff.dto';
import {
  AuditAction,
  AuditTarget,
  Prisma,
  StaffActivityAssignments,
  StaffClassAssignments,
  StaffStatus,
  OtpPurpose,
  JobTitle,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateTempPassword } from './helpers/generate-temp-password.util';
import * as argon2 from 'argon2';
import { FilteredStaffDto } from './dto/filter-staff.dto';
import { EditStaffDto } from './dto/edit-staff.dto';
import { RolesService } from '../roles/roles.service';
import { EditPermissionsDto } from './dto/edit-permissions.dto';
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import {
  ConfirmEmailChangeDto,
  RequestEmailChangeDto,
} from './dto/change-email.dto';
import { OtpService } from '../mail/otp.serivce';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rolesSerive: RolesService,
    private readonly otpService: OtpService,
  ) {}

  async assertStaffManageable(
    staffId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const staff = await db.staffMembers.findUnique({
      where: { id: staffId },
      select: { isSuperAdmin: true },
    });
    if (!staff) throw new NotFoundException('الموظف غير موجود');
    if (staff.isSuperAdmin)
      throw new ForbiddenException(
        'لا يمكن تغيير حالة مدير النظام أو حذفه أو تعديل صلاحياته',
      );
  }

  async getRoleOptionsForStaff(staffId: string) {
    // Show all roles, checking only those returned by the active-grants lookup.
    const [roles, usedRoles] = await Promise.all([
      this.rolesSerive.getRoles(),
      this.rolesSerive.getUsedRoles(staffId),
    ]);

    const selectedRoles = new Set(usedRoles.map((role) => role.roleId));

    return roles.map((role) => ({
      ...role,
      selected: selectedRoles.has(role.id),
    }));
  }

  async getPermissionOptionsForStaff(staffId: string) {
    // Combine the permission catalog with active direct grants. Revoked rows
    // remain in the database but must not appear checked when reopening.
    const [permissionsData, grants] = await Promise.all([
      this.rolesSerive.getPermissionsWithCategory(),
      this.prisma.directPermissionGrants.findMany({
        where: { staffId, revokedAt: null },
        select: { permissionId: true, scopeType: true },
      }),
    ]);

    // The same permission can have historical rows for different scopes,
    // so identify a selection by both the permission ID and its scope.
    const selectedKeys = new Set(
      grants.map((grant) => `${grant.permissionId}:${grant.scopeType}`),
    );

    let total = 0;

    for (const column of permissionsData.permissionColumns) {
      for (const group of column) {
        group.selectedCount = 0;

        for (const resource of group.resources) {
          for (const action of resource.actions) {
            // One dropdown can display one scope per action. For legacy data
            // with several active scopes, show the first in allowedScopes order;
            // saving that selection will revoke the other active scope rows.
            const selectedScope = action.scopes.find((scope) =>
              selectedKeys.has(`${action.id}:${scope}`),
            );

            action.selected = selectedScope !== undefined;
            action.selectedScope = selectedScope;

            if (action.selected) group.selectedCount++;
          }
        }

        total += group.selectedCount;
      }
    }

    // Count checked actions, not historical grant rows, for the UI badges.
    permissionsData.selectedPermissionCount = total;
    return permissionsData;
  }

  async editPermissions(
    staffId: string,
    editPermissionsDto: EditPermissionsDto,
    actorId: string,
  ) {
    // The form submits the complete desired selection, not just changes.
    // Empty arrays therefore remove all roles and revoke all active direct grants.
    const { roleIds = [], permissions = [] } = editPermissionsDto;

    try {
      // All reads and writes below share one transaction. Any thrown error
      // rolls back role replacement and direct-grant changes together.
      await this.prisma.$transaction(
        async (tx) => {
          await this.assertStaffManageable(staffId, tx);
          const protectedRole = await tx.roles.findFirst({
            where: { id: { in: roleIds }, isSuperAdminRole: true },
          });
          if (protectedRole)
            throw new ForbiddenException('لا يمكن إسناد قالب مدير النظام');
          // Check existence even when both selections are empty and no new
          // grant would otherwise trigger a foreign-key check.
          const staff = await tx.staffMembers.findUnique({
            where: { id: staffId, isDeleted: false },
            select: { id: true },
          });
          if (!staff) throw new NotFoundException('الموظف غير موجود');

          // Reject invalid selections before replacing existing assignments.
          if (new Set(roleIds).size !== roleIds.length) {
            throw new UnprocessableEntityException('قوالب الصلاحيات مكررة');
          }

          const roles = await tx.roles.findMany({
            where: { id: { in: roleIds } },
            select: { id: true },
          });
          if (roles.length !== roleIds.length) {
            throw new UnprocessableEntityException(
              'أحد قوالب الصلاحيات المحددة غير موجود',
            );
          }

          // Validate duplicate pairs and enforce the UI's one-scope-per-action
          // rule on the server too; callers can bypass the browser form.
          const selectedKeys = new Set<string>();
          const permissionIds = new Set<string>();
          for (const { permissionId, scope } of permissions) {
            const key = `${permissionId}:${scope}`;
            if (selectedKeys.has(key)) {
              throw new UnprocessableEntityException('صلاحيات مكررة');
            }
            // The editor has one scope dropdown per action.
            if (permissionIds.has(permissionId)) {
              throw new UnprocessableEntityException(
                'اختر نطاقًا واحدًا فقط لكل صلاحية',
              );
            }
            selectedKeys.add(key);
            permissionIds.add(permissionId);
          }

          // UUID/enum DTO validation does not prove that a permission exists
          // or supports this scope. Check the catalog before making any writes.
          const catalog = await tx.permissions.findMany({
            where: { id: { in: [...permissionIds] } },
            select: { id: true, allowedScopes: true },
          });
          const permissionsById = new Map(catalog.map((p) => [p.id, p]));
          for (const { permissionId, scope } of permissions) {
            const permission = permissionsById.get(permissionId);
            if (!permission) {
              throw new UnprocessableEntityException('صلاحية غير موجودة');
            }
            if (!permission.allowedScopes.includes(scope)) {
              throw new UnprocessableEntityException('نطاق غير مسموح للصلاحية');
            }
          }

          // Compare the requested pairs with active grants. Matching pairs
          // stay untouched; absent pairs are revoked; new pairs are upserted.
          const activeGrants = await tx.directPermissionGrants.findMany({
            where: { staffId, revokedAt: null },
            select: { id: true, permissionId: true, scopeType: true },
          });
          const activeKeys = new Set(
            activeGrants.map((g) => `${g.permissionId}:${g.scopeType}`),
          );
          const revokedIds = activeGrants
            .filter(
              (g) => !selectedKeys.has(`${g.permissionId}:${g.scopeType}`),
            )
            .map((g) => g.id);
          const now = new Date();

          // Keep the existing role replacement behavior: delete this staff
          // member's role rows, then recreate only the submitted roleIds.
          // An empty role selection deliberately skips creation.
          await tx.roleStaffAssignments.deleteMany({ where: { staffId } });
          if (roleIds.length) {
            await tx.roleStaffAssignments.createMany({
              data: roleIds.map((roleId) => ({
                roleId,
                staffId,
                grantedById: actorId,
              })),
            });
          }

          // Soft-revoke unchecked pairs, preserving their original grantor
          // and grant time. Changing a dropdown also revokes the old scope.
          if (revokedIds.length) {
            await tx.directPermissionGrants.updateMany({
              where: { staffId, id: { in: revokedIds }, revokedAt: null },
              data: { revokedAt: now },
            });
          }

          for (const { permissionId, scope: scopeType } of permissions) {
            // Retaining a grant must not overwrite its attribution or timestamp.
            if (activeKeys.has(`${permissionId}:${scopeType}`)) continue;

            // The composite unique key includes revoked rows. Upsert creates
            // a missing pair or reuses its revoked row without a uniqueness error.
            // Reactivation starts a new grant period with the current actor/time.
            await tx.directPermissionGrants.upsert({
              where: {
                staffId_permissionId_scopeType: {
                  staffId,
                  permissionId,
                  scopeType,
                },
              },
              create: {
                staffId,
                permissionId,
                scopeType,
                grantedById: actorId,
                grantedAt: now,
              },
              update: {
                revokedAt: null,
                grantedById: actorId,
                grantedAt: now,
              },
            });
          }
        },
        // Concurrent saves must not merge different scopes for the same action.
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      // A serialization conflict aborts the transaction; ask the caller to
      // retry instead of reporting success. Other errors also propagate.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'تغيّرت الصلاحيات أثناء الحفظ. أعد المحاولة',
        );
      }
      throw error;
    }
  }

  async editStaff(
    staffId: string,
    editStaffDto: EditStaffDto,
    actorId: string,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const staff = await tx.staffMembers.update({
          where: { id: staffId, isDeleted: false },
          data: {
            fullName: editStaffDto.fullName,
            jobTitle: editStaffDto.jobTitle,
            nationalId: editStaffDto.nationalId,
            phone: editStaffDto.phoneNumber,
            dateOfBirth: editStaffDto.dateOfBirth,
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            jobTitle: true,
            status: true,
          },
        });
        await this.audit.record(tx, {
          actorId,
          actionType: 'STAFF_UPDATED',
          targetType: 'STAFF',
          targetId: staffId,
          isSuccess: true,
        });
        return staff;
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          message: 'بيانات الملف مستخدمة بالفعل',
          errors: { nationalId: 'تحقق من الرقم الوطني' },
        });
      throw error;
    }
  }

  async cancelPendingInvitation(staffId: string) {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          // Preserve the account identity and history for future invitations.
          const { count } = await tx.staffMembers.updateMany({
            where: {
              id: staffId,
              status: StaffStatus.PENDING,
              isDeleted: false,
            },
            data: {
              isDeleted: true,
              status: StaffStatus.INACTIVE,
              mustChangePassword: true,
              sessionVersion: { increment: 1 },
              fullName: null,
              jobTitle: null,
              passwordHash: null,
              dateOfBirth: null,
              nationalId: null,
              phone: null,
            },
          });

          if (count === 0) {
            throw new NotFoundException(
              'لم يتم العثور على دعوة معلقة لهذا الموظف',
            );
          }

          await tx.oTPs.deleteMany({ where: { staffId } });
          await tx.roleStaffAssignments.deleteMany({ where: { staffId } });
          await tx.directPermissionGrants.deleteMany({ where: { staffId } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'تغيّرت بيانات الموظف أثناء إلغاء الدعوة. حدّث الصفحة وأعد المحاولة',
        );
      }
      throw error;
    }
  }

  async showFilteredStaff(filterDto: FilteredStaffDto) {
    const {
      searchField,
      status,
      isDeleted = false,
      halaqa,
      role,
      page,
      limit,
    } = filterDto;
    const skip = (page! - 1) * limit!;

    //validate foreign keys
    await this.validateRelations(halaqa, role);

    const where: Prisma.StaffMembersWhereInput = { isDeleted };

    //define search parameters
    if (searchField) {
      where.OR = [
        { fullName: { contains: searchField, mode: 'insensitive' } },
        {
          jobTitle: {
            in: Object.values(JobTitle).filter(
              (title) =>
                jobTitleLabels[title].includes(searchField) ||
                title.toLowerCase().includes(searchField.toLowerCase()),
            ),
          },
        },
      ];
    }
    if (status) where.status = status;
    else if (!isDeleted) where.status = { not: StaffStatus.PENDING };
    if (halaqa)
      where.classAssignments = { some: { halaqaId: halaqa, endedAt: null } };
    if (role) where.roleGrants = { some: { roleId: role, revokedAt: null } };
    //search
    const staffList = await this.prisma.staffMembers.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return staffList.map((staff) => ({
      ...staff,
      jobTitleLabel: staff.jobTitle ? jobTitleLabels[staff.jobTitle] : '',
    }));
  }

  async showStaffEditPage(staffId: string) {
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId, isDeleted: false },
      select: {
        id: true,
        email: true,
        fullName: true,
        jobTitle: true,
        nationalId: true,
        status: true,
        dateOfBirth: true,
        phone: true,
      },
    });

    if (!staff) throw new NotFoundException('الموظف غير موجود');
    if (staff.status === 'PENDING')
      throw new BadRequestException('لا يمكن التعديل: دعوة معلّقة');
    return { ...staff, jobTitleOptions: jobTitleOptions(staff.jobTitle) };
  }

  async showStaffFilterOptions(
    selectedHalaqaId?: string,
    selectedRoleId?: string,
  ) {
    const [classes, templates] = await Promise.all([
      this.prisma.halaqas.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.roles.findMany({
        where: { isSuperAdminRole: false },
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

  private async validateRelations(
    halaqaId?: string,
    roleId?: string,
  ): Promise<void> {
    if (halaqaId) {
      const classExists = await this.prisma.halaqas.findUnique({
        where: { id: halaqaId },
        select: { id: true },
      });
      if (!classExists)
        throw new BadRequestException(`Class ID "${halaqaId}" does not exist.`);
    }

    if (roleId) {
      const roleExists = await this.prisma.roles.findUnique({
        where: { id: roleId },
        select: { id: true },
      });
      if (!roleExists)
        throw new BadRequestException(`Role ID "${roleId}" does not exist.`);
    }
  }

  async showStaffProfile(staffId: string) {
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        fullName: true,
        email: true,
        jobTitle: true,
        status: true,
        isDeleted: true,
        isSuperAdmin: true,
        dateOfBirth: true,
        nationalId: true,
        phone: true,
        classAssignments: {
          where: { endedAt: null },
          select: {
            halaqa: {
              select: { id: true, name: true },
            },
          },
        },
        activityAssignments: {
          where: { endedAt: null },
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

    if (!staff || staff.status === StaffStatus.PENDING || staff.isDeleted) {
      throw new NotFoundException('الموظف غير موجود');
    }

    return {
      ...staff,
      jobTitleLabel: staff.jobTitle ? jobTitleLabels[staff.jobTitle] : '',
    };
  }

  async showPendingStaff() {
    const staff = await this.prisma.staffMembers.findMany({
      where: { status: 'PENDING', mustChangePassword: true, isDeleted: false },
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

  async deactivateStaff(staffId: string, actorId: string) {
    await this.assertStaffManageable(staffId);
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId, isDeleted: false },
      select: {
        id: true,
        status: true,
        classAssignments: { where: { endedAt: null } },
        activityAssignments: { where: { endedAt: null } },
      },
    });
    //validations
    if (!staff) throw new NotFoundException("can't find this employee");
    if (staff.status !== 'ACTIVE')
      throw new ConflictException("staff member can't be deactivated");
    await this.validateStaffNotAloneInClassesAndActivities(
      staffId,
      staff.classAssignments,
      staff.activityAssignments,
    );
    //changes
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertStaffManageable(staffId, tx);
        await tx.staffMembers.update({
          where: { id: staffId, isDeleted: false },
          data: {
            status: StaffStatus.INACTIVE,
            sessionVersion: { increment: 1 },
          },
        });
        await this.audit.record(tx, {
          actorId,
          targetType: 'STAFF',
          actionType: 'STAFF_DEACTIVATED',
          targetId: staffId,
          isSuccess: true,
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          message: 'a conflict has occured',
          errors: { email: 'a conflict has occured' },
        });
      throw error;
    }
  }

  async activateStaff(staffId: string, actorId: string) {
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId, isDeleted: false },
      select: {
        id: true,
        status: true,
      },
    });
    //validations
    if (!staff) throw new NotFoundException("can't find this employee");
    if (staff.status !== 'INACTIVE')
      throw new ConflictException("staff member can't be activated");
    //changes
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.staffMembers.update({
          where: { id: staffId, isDeleted: false },
          data: { status: StaffStatus.ACTIVE },
        });
        await this.audit.record(tx, {
          actorId,
          targetType: 'STAFF',
          actionType: 'STAFF_ACTIVATED',
          targetId: staffId,
          isSuccess: true,
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          message: 'a conflict has occured',
          errors: { email: 'a conflict has occured' },
        });
      throw error;
    }
  }

  async deleteStaff(staffId: string, actorId: string) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.assertStaffManageable(staffId, tx);
          const staff = await tx.staffMembers.findUnique({
            where: { id: staffId, isDeleted: false },
            select: {
              status: true,
              classAssignments: { where: { endedAt: null } },
              activityAssignments: { where: { endedAt: null } },
            },
          });
          if (!staff) throw new NotFoundException('الموظف غير موجود');
          if (
            staff.status !== StaffStatus.ACTIVE &&
            staff.status !== StaffStatus.INACTIVE
          )
            throw new ConflictException('لا يمكن حذف هذا الموظف');

          // Validate and write in the same transaction, including assignment history.
          await this.validateStaffNotAloneInClassesAndActivities(
            staffId,
            staff.classAssignments,
            staff.activityAssignments,
            tx,
          );
          const endedAt = new Date();
          await tx.roleStaffAssignments.deleteMany({ where: { staffId } });
          await tx.directPermissionGrants.deleteMany({ where: { staffId } });
          await tx.oTPs.deleteMany({ where: { staffId } });
          await tx.staffClassAssignments.updateMany({
            where: { staffId, endedAt: null },
            data: { endedAt },
          });
          await tx.staffActivityAssignments.updateMany({
            where: { staffId, endedAt: null },
            data: { endedAt },
          });
          await tx.staffMembers.update({
            where: { id: staffId, isDeleted: false },
            data: {
              isDeleted: true,
              sessionVersion: { increment: 1 },
              status: StaffStatus.INACTIVE,
              mustChangePassword: true,
              fullName: null,
              jobTitle: null,
              passwordHash: null,
              dateOfBirth: null,
              nationalId: null,
              phone: null,
            },
          });
          await this.audit.record(tx, {
            actorId,
            targetType: 'STAFF',
            actionType: 'STAFF_DELETED',
            targetId: staffId,
            isSuccess: true,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2025')
      ) {
        throw new ConflictException(
          'تغيّرت بيانات الموظف أثناء الحذف. حدّث الصفحة وأعد المحاولة',
        );
      }
      throw error;
    }
  }

  async generatePassword(staffId: string, actorId: string) {
    if (staffId === actorId) {
      throw new ForbiddenException('استخدم صفحة تغيير كلمة المرور الخاصة بك');
    }

    const temporaryPassword = generateTempPassword();
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });

    return this.prisma.$transaction(async (tx) => {
      await this.assertStaffManageable(staffId, tx);
      const { count } = await tx.staffMembers.updateMany({
        where: { id: staffId, isDeleted: false },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
          mustChangePassword: false,
        },
      });

      if (count !== 1) {
        throw new NotFoundException('الموظف غير موجود');
      }

      await this.audit.record(tx, {
        actorId,
        actionType: AuditAction.STAFF_UPDATED,
        targetType: AuditTarget.STAFF,
        targetId: staffId,
        isSuccess: true,
      });

      await tx.oTPs.deleteMany({ where: { staffId } });
      return temporaryPassword;
    });
  }

  async inviteStaff(inviteStaffDto: InviteStaffDto, actorId: string) {
    const { email, fullName, jobTitle } = inviteStaffDto;
    const normalizedEmail = email.trim().toLowerCase();

    const existingStaff = await this.prisma.staffMembers.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, isDeleted: true },
    });

    // Check if the Staff exist and not deleted.
    if (existingStaff && !existingStaff.isDeleted) {
      throw new ConflictException('البريد الإلكتروني موجود');
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
      isDeleted: false,
      mustChangePassword: true,
    };

    const select = {
      id: true,
      email: true,
      fullName: true,
      jobTitle: true,
      status: true,
    } satisfies Prisma.StaffMembersSelect;

    type StaffSummary = Prisma.StaffMembersGetPayload<{
      select: typeof select;
    }>;

    try {
      return await this.prisma.$transaction(async (tx) => {
        let staff: StaffSummary;

        // Check if the staff exist and deleted
        if (existingStaff && existingStaff.isDeleted) {
          // Change the status to pending
          staff = await tx.staffMembers.update({
            // We need the check here too, to prevent another invitation at the same time.
            where: {
              id: existingStaff.id,
              isDeleted: true,
            },
            data: { ...data, sessionVersion: { increment: 1 } },
            select,
          });
        } else {
          staff = await tx.staffMembers.create({
            data,
            select,
          });
        }

        await this.audit.record(tx, {
          actorId,
          actionType: AuditAction.STAFF_INVITED,
          targetType: AuditTarget.STAFF,
          targetId: staff.id,
          isSuccess: true,
        });

        return { staff, temporaryPassword };
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException({
            message: 'هذا البريد الإلكتروني مسجّل بالفعل',
            errors: { email: 'هذا البريد الإلكتروني مسجّل بالفعل' },
          });
        }

        if (existingStaff && error.code === 'P2025') {
          throw new ConflictException(
            'تغيّر حساب الموظف أثناء الدعوة. حدّث الصفحة وأعد المحاولة',
          );
        }
      }
      throw error;
    }
  }
  private async validateStaffNotAloneInClassesAndActivities(
    staffId: string,
    classAssignments: StaffClassAssignments[],
    activityAssignments: StaffActivityAssignments[],
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const [halaqas, activities] = await Promise.all([
      db.halaqas.findMany({
        where: {
          id: { in: classAssignments.map(({ halaqaId }) => halaqaId) },
          staffAssignments: { some: { staffId, endedAt: null } },
        },
        select: {
          name: true,
          _count: {
            select: {
              staffAssignments: {
                where: { endedAt: null, staff: { isDeleted: false } },
              },
            },
          },
        },
      }),
      db.activities.findMany({
        where: {
          id: { in: activityAssignments.map(({ activityId }) => activityId) },
          staffAssignments: { some: { staffId, endedAt: null } },
        },
        select: {
          name: true,
          _count: {
            select: {
              staffAssignments: {
                where: { endedAt: null, staff: { isDeleted: false } },
              },
            },
          },
        },
      }),
    ]);

    const soleStaffHalaqas = halaqas
      .filter(({ _count }) => _count.staffAssignments === 1)
      .map(({ name }) => name);
    const soleStaffActivities = activities
      .filter(({ _count }) => _count.staffAssignments === 1)
      .map(({ name }) => name);

    if (soleStaffHalaqas.length || soleStaffActivities.length) {
      const assignments = [
        ...(soleStaffHalaqas.length
          ? [`halaqa(s): ${soleStaffHalaqas.join(', ')}`]
          : []),
        ...(soleStaffActivities.length
          ? [`activity/activities: ${soleStaffActivities.join(', ')}`]
          : []),
      ];

      throw new ForbiddenException(
        `Cannot remove the only assigned staff member from ${assignments.join('; ')}.`,
      );
    }
  }

  async getAccountSecurity(staffId: string) {
    const staff = await this.loadActiveAccount(staffId);
    return { id: staff.id, email: staff.email };
  }

  private async loadActiveAccount(
    staffId: string,
    sessionVersion?: number,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const staff = await db.staffMembers.findFirst({
      where: {
        id: staffId,
        sessionVersion,
        isDeleted: false,
        status: StaffStatus.ACTIVE,
        mustChangePassword: false,
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        sessionVersion: true,
      },
    });
    if (!staff) throw new UnauthorizedException('يرجى تسجيل الدخول أولًا');
    return staff;
  }

  async sendChangePasswordOtp(staffId: string, sessionVersion: number) {
    await this.otpService.issueOtp(
      staffId,
      OtpPurpose.PASSWORD_CHANGE,
      undefined,
      sessionVersion,
    );
  }

  async changeMyPassword(
    dto: ChangeMyPasswordDto,
    staffId: string,
    sessionVersion: number,
  ) {
    const staff = await this.loadActiveAccount(staffId, sessionVersion);
    return this.changeStaffPassword(dto, staff, OtpPurpose.PASSWORD_CHANGE);
  }

  async sendForgotPasswordOtp(email: string) {
    const staff = await this.prisma.staffMembers.findFirst({
      where: {
        email: email.trim().toLowerCase(),
        isDeleted: false,
        status: StaffStatus.ACTIVE,
        mustChangePassword: false,
      },
      select: { id: true, sessionVersion: true },
    });
    if (staff)
      await this.otpService.issueOtp(
        staff.id,
        OtpPurpose.PASSWORD_RESET,
        undefined,
        staff.sessionVersion,
      );
  }

  async resetForgottenPassword(dto: ForgotPasswordDto) {
    const staff = await this.prisma.staffMembers.findFirst({
      where: {
        email: dto.email.trim().toLowerCase(),
        isDeleted: false,
        status: StaffStatus.ACTIVE,
        mustChangePassword: false,
      },
      select: { id: true, email: true, sessionVersion: true },
    });
    if (!staff)
      throw new UnprocessableEntityException({
        message: 'رمز التحقق غير صحيح أو منتهي الصلاحية',
        errors: { otp: 'رمز التحقق غير صحيح أو منتهي الصلاحية' },
      });
    await this.changeStaffPassword(dto, staff, OtpPurpose.PASSWORD_RESET);
  }

  private async changeStaffPassword(
    dto: ChangeMyPasswordDto,
    staff: { id: string; email: string; sessionVersion: number },
    purpose: OtpPurpose,
  ) {
    return this.otpService.withVerifiedOtp(
      staff.id,
      purpose,
      dto.otp,
      async (tx) => {
        await this.loadActiveAccount(staff.id, staff.sessionVersion, tx);
        // Reject invalid codes before performing expensive password hashing.
        const passwordHash = await argon2.hash(dto.newPassword, {
          type: argon2.argon2id,
        });

        const updated = await tx.staffMembers.update({
          where: {
            id: staff.id,
            email: staff.email,
            sessionVersion: staff.sessionVersion,
          },
          data: { passwordHash, sessionVersion: { increment: 1 } },
          select: { sessionVersion: true },
        });
        // Outstanding challenges were issued before this credential change.
        await tx.oTPs.deleteMany({ where: { staffId: staff.id } });
        await this.audit.record(tx, {
          actorId: staff.id,
          actionType: AuditAction.STAFF_UPDATED,
          targetType: AuditTarget.STAFF,
          targetId: staff.id,
          isSuccess: true,
        });
        return updated.sessionVersion;
      },
      staff.email,
    );
  }

  private async assertEmailAvailable(
    email: string,
    staffId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const existing = await db.staffMembers.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException({
        message:
          existing.id === staffId
            ? 'هذا هو بريدك الإلكتروني الحالي'
            : 'البريد الإلكتروني مستخدم بالفعل',
        errors: {
          email:
            existing.id === staffId
              ? 'أدخل بريدًا إلكترونيًا مختلفًا'
              : 'البريد الإلكتروني مستخدم بالفعل',
        },
      });
  }

  async sendChangeEmailOtp(
    staffId: string,
    dto: RequestEmailChangeDto,
    sessionVersion: number,
  ) {
    const staff = await this.loadActiveAccount(staffId, sessionVersion);
    if (
      !staff.passwordHash ||
      !(await argon2.verify(staff.passwordHash, dto.currentPassword))
    ) {
      throw new UnprocessableEntityException({
        message: 'كلمة المرور الحالية غير صحيحة',
        errors: { currentPassword: 'كلمة المرور الحالية غير صحيحة' },
      });
    }
    const email = dto.email.trim().toLowerCase();
    await this.assertEmailAvailable(email, staffId);
    await this.otpService.issueOtp(
      staffId,
      OtpPurpose.EMAIL_CHANGE,
      email,
      sessionVersion,
    );
  }

  async resendChangeEmailOtp(
    staffId: string,
    email: string,
    sessionVersion: number,
  ) {
    await this.loadActiveAccount(staffId, sessionVersion);
    const challenge = await this.prisma.oTPs.findUnique({
      where: { staffId_purpose: { staffId, purpose: OtpPurpose.EMAIL_CHANGE } },
    });
    if (
      !challenge ||
      challenge.targetEmail !== email ||
      challenge.expiresAt <= new Date()
    ) {
      throw new ConflictException(
        'ابدأ تغيير البريد مجددًا وأدخل كلمة المرور الحالية.',
      );
    }
    await this.assertEmailAvailable(email, staffId);
    await this.otpService.issueOtp(
      staffId,
      OtpPurpose.EMAIL_CHANGE,
      email,
      sessionVersion,
    );
  }

  async changeEmail(
    staffId: string,
    dto: ConfirmEmailChangeDto,
    sessionVersion: number,
  ) {
    const email = dto.email.trim().toLowerCase();
    try {
      return await this.otpService.withVerifiedOtp(
        staffId,
        OtpPurpose.EMAIL_CHANGE,
        dto.otp,
        async (tx) => {
          await this.loadActiveAccount(staffId, sessionVersion, tx);
          await this.assertEmailAvailable(email, staffId, tx);
          const updated = await tx.staffMembers.update({
            where: { id: staffId, sessionVersion },
            data: { email, sessionVersion: { increment: 1 } },
            select: { sessionVersion: true },
          });
          await tx.oTPs.deleteMany({ where: { staffId } });
          await this.audit.record(tx, {
            actorId: staffId,
            actionType: AuditAction.STAFF_UPDATED,
            targetType: AuditTarget.STAFF,
            targetId: staffId,
            isSuccess: true,
          });
          return updated.sessionVersion;
        },
        email,
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'البريد الإلكتروني مستخدم بالفعل',
          errors: { email: 'البريد الإلكتروني مستخدم بالفعل' },
        });
      }
      throw error;
    }
  }
}
