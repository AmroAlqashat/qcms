import { error } from 'console';
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
  ScopeType,
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
import {
  buildPermissionsData,
  permissionCatalogQuery,
} from '../roles/helpers/permission-view';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rolesService: RolesService,
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

  private assertStaffScope(
    actorId: string,
    staffId: string,
    scope: ScopeType,
  ): void {
    if (scope === ScopeType.CENTER_WIDE) return;
    if (scope === ScopeType.OWN_ACCOUNT && actorId === staffId) return;

    throw new ForbiddenException('You may not access this staff member');
  }

  assertCenterWideScope(scope: ScopeType): void {
    if (scope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException(
        'This operation requires center-wide staff permission',
      );
    }
  }

  async getRoleOptionsForStaff(
    editedStaffId: string,
    scope: ScopeType,
    editorId: string,
  ) {
    this.assertCenterWideScope(scope);
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: editorId },
      select: { isSuperAdmin: true },
    });

    if (!staff) throw new NotFoundException('الموظف غير موجود');

    const [roles, usedRoles, actorUsedRoles] = await Promise.all([
      this.rolesService.getRoles(),
      this.rolesService.getUsedRoles(editedStaffId),
      this.rolesService.getUsedRoles(editorId),
    ]);

    const selectedRoles = new Set(usedRoles.map((role) => role.roleId));

    const staffAssignedRoles = staff.isSuperAdmin
      ? roles
      : roles.filter((role) =>
          actorUsedRoles.some((assignment) => assignment.roleId === role.id),
        );

    return staffAssignedRoles.map((role) => ({
      ...role,
      selected: selectedRoles.has(role.id),
    }));
  }

  // Read current assignment authority again inside the save transaction; never
  // trust the choices shown by an earlier GET request.
  private async getAssignmentAccess(
    editorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const editor = await db.staffMembers.findUnique({
      where: { id: editorId, isDeleted: false },
      select: {
        isSuperAdmin: true,
        roleGrants: {
          where: { revokedAt: null, role: { isSuperAdminRole: false } },
          select: { roleId: true },
        },
        directPermissionGrants: {
          where: { revokedAt: null },
          select: {
            permissionId: true,
            scopeType: true,
            permission: { select: { allowedScopes: true } },
          },
        },
      },
    });
    if (!editor) throw new NotFoundException('الموظف غير موجود');

    const permissionScopes = new Map<string, Set<ScopeType>>();
    for (const grant of editor.directPermissionGrants) {
      if (!grant.permission.allowedScopes.includes(grant.scopeType)) continue;
      const scopes =
        permissionScopes.get(grant.permissionId) ?? new Set<ScopeType>();
      scopes.add(grant.scopeType);
      permissionScopes.set(grant.permissionId, scopes);
    }
    return {
      isSuperAdmin: editor.isSuperAdmin,
      roleIds: editor.roleGrants.map((grant) => grant.roleId),
      permissionScopes,
    };
  }

  async getPermissionOptionsForStaff(
    editedStaffId: string,
    scope: ScopeType,
    editorId: string,
  ) {
    this.assertCenterWideScope(scope);
    const access = await this.getAssignmentAccess(editorId);
    const permissions = await this.prisma.permissions.findMany({
      ...permissionCatalogQuery,
      where: access.isSuperAdmin
        ? {}
        : { id: { in: [...access.permissionScopes.keys()] } },
      select: {
        ...permissionCatalogQuery.select,
        directPermissionGrants: {
          where: { staffId: editedStaffId, revokedAt: null },
          select: { scopeType: true },
        },
      },
    });

    // One dropdown cannot represent an additional, unmanageable saved scope.
    // Hide that action entirely and preserve it when saving.
    const available = access.isSuperAdmin
      ? permissions
      : permissions
          .filter((permission) =>
            permission.directPermissionGrants.every((grant) =>
              access.permissionScopes.get(permission.id)?.has(grant.scopeType),
            ),
          )
          .map((permission) => ({
            ...permission,
            allowedScopes: permission.allowedScopes.filter((allowedScope) =>
              access.permissionScopes.get(permission.id)?.has(allowedScope),
            ),
          }));

    return buildPermissionsData(available, (permission) =>
      permission.directPermissionGrants.map((grant) => grant.scopeType),
    );
  }

  async editPermissions(
    staffId: string,
    editPermissionsDto: EditPermissionsDto,
    actorId: string,
    scope: ScopeType,
  ) {
    this.assertCenterWideScope(scope);
    // The form replaces only the assignments this editor can manage.
    // Empty selections preserve every assignment outside that authority.
    const { roleIds = [], permissions = [] } = editPermissionsDto;

    try {
      // All reads and writes below share one transaction. Any thrown error
      // rolls back role replacement and direct-grant changes together.
      await this.prisma.$transaction(
        async (tx) => {
          await this.assertStaffManageable(staffId, tx);
          const access = await this.getAssignmentAccess(actorId, tx);
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

          if (
            !access.isSuperAdmin &&
            roleIds.some((roleId) => !access.roleIds.includes(roleId))
          ) {
            throw new ForbiddenException('لا يمكنك إسناد قالب غير مسند إليك');
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
            if (
              !access.isSuperAdmin &&
              !access.permissionScopes.get(permissionId)?.has(scope)
            ) {
              throw new ForbiddenException(
                'لا يمكنك إسناد صلاحية أو نطاق غير ممنوح لك مباشرة',
              );
            }
          }

          // Compare the requested pairs with active grants. Matching pairs
          // stay untouched; absent pairs are revoked; new pairs are upserted.
          const activeGrants = await tx.directPermissionGrants.findMany({
            where: { staffId, revokedAt: null },
            select: { id: true, permissionId: true, scopeType: true },
          });
          const blockedPermissionIds = new Set(
            activeGrants
              .filter(
                (grant) =>
                  !access.isSuperAdmin &&
                  !access.permissionScopes
                    .get(grant.permissionId)
                    ?.has(grant.scopeType),
              )
              .map((grant) => grant.permissionId),
          );
          if (
            permissions.some((grant) =>
              blockedPermissionIds.has(grant.permissionId),
            )
          ) {
            throw new ForbiddenException(
              'لا يمكنك تعديل صلاحية لها نطاق خارج صلاحياتك',
            );
          }
          const activeKeys = new Set(
            activeGrants.map((g) => `${g.permissionId}:${g.scopeType}`),
          );
          const revokedIds = activeGrants
            .filter(
              (g) =>
                !blockedPermissionIds.has(g.permissionId) &&
                (access.isSuperAdmin ||
                  access.permissionScopes
                    .get(g.permissionId)
                    ?.has(g.scopeType)) &&
                !selectedKeys.has(`${g.permissionId}:${g.scopeType}`),
            )
            .map((g) => g.id);
          const now = new Date();

          // Replace manageable roles only; hidden assignments remain untouched.
          await tx.roleStaffAssignments.deleteMany({
            where: {
              staffId,
              role: { isSuperAdminRole: false },
              ...(access.isSuperAdmin
                ? {}
                : { roleId: { in: access.roleIds } }),
            },
          });
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
    scope: ScopeType,
  ) {
    this.assertStaffScope(actorId, staffId, scope);
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

  async cancelPendingInvitation(staffId: string, scope: ScopeType) {
    this.assertCenterWideScope(scope);
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

  async showFilteredStaff(
    filterDto: FilteredStaffDto,
    actorId: string,
    scope: ScopeType,
  ) {
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

    const where: Prisma.StaffMembersWhereInput = { isDeleted };
    if (scope === ScopeType.OWN_ACCOUNT) {
      where.id = actorId;
    } else if (scope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException(
        'This scope cannot be used to list staff members',
      );
    } else {
      await this.validateRelations(halaqa, role);
    }

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

  async showStaffEditPage(staffId: string, actorId: string, scope: ScopeType) {
    this.assertStaffScope(actorId, staffId, scope);
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
        isSuperAdmin: true,
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

  async showStaffProfile(actorId: string, staffId: string, scope: ScopeType) {
    this.assertStaffScope(actorId, staffId, scope);

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

  async showPendingStaff(scope: ScopeType) {
    this.assertCenterWideScope(scope);

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

  async deactivateStaff(staffId: string, actorId: string, scope: ScopeType) {
    this.assertCenterWideScope(scope);
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

  async activateStaff(staffId: string, actorId: string, scope: ScopeType) {
    this.assertCenterWideScope(scope);
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

  async deleteStaff(staffId: string, actorId: string, scope: ScopeType) {
    this.assertCenterWideScope(scope);
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

  async generatePassword(staffId: string, actorId: string, scope: ScopeType) {
    this.assertStaffScope(actorId, staffId, scope);
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

  async inviteStaff(
    inviteStaffDto: InviteStaffDto,
    actorId: string,
    scope: ScopeType,
  ) {
    this.assertCenterWideScope(scope);
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

        const readAction = await tx.permission_actions.findUnique({
          where: { eng_name: 'read' },
          select: { id: true },
        });

        const editAction = await tx.permission_actions.findUnique({
          where: { eng_name: 'edit' },
          select: { id: true },
        });

        const employeeResource = await tx.permission_resources.findUnique({
          where: { eng_name: 'staff' },
          select: { id: true },
        });

        if (!readAction || !employeeResource || !editAction)
          throw new UnauthorizedException('an error has occured');

        const viewOwnAccountPerm = await tx.permissions.findUnique({
          where: {
            resource_action: {
              action: readAction?.id,
              resource: employeeResource?.id,
            },
          },
        });
        const editOwnAccountPerm = await tx.permissions.findUnique({
          where: {
            resource_action: {
              resource: employeeResource.id,
              action: editAction.id,
            },
          },
        });

        if (!viewOwnAccountPerm || !editOwnAccountPerm)
          throw new error('view own account permission not found ?!!');

        const confirmPermAssignment =
          await tx.directPermissionGrants.createManyAndReturn({
            data: [
              {
                grantedById: actorId,
                scopeType: ScopeType.OWN_ACCOUNT,
                staffId: staff.id,
                permissionId: viewOwnAccountPerm.id,
              },
              {
                grantedById: actorId,
                scopeType: ScopeType.OWN_ACCOUNT,
                staffId: staff.id,
                permissionId: editOwnAccountPerm.id,
              },
            ],
          });

        if (confirmPermAssignment.length !== 2) throw new error('');

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
