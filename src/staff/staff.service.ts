import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { AuditAction, AuditTarget, Prisma, StaffActivityAssignments, StaffClassAssignments, StaffStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateTempPassword } from './helpers/generate-temp-password.util';
import * as argon2 from 'argon2';
import { FilteredStaffDto } from './dto/filter-staff.dto';
import { EditStaffDto } from './dto/edit-staff.dto';
import { RolesService } from '../roles/roles.service';
import { EditPermissionsDto } from './dto/edit-permissions.dto';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rolesSerive: RolesService,
  ) { }

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
      grants.map((grant) => `${grant.permissionId}:${grant.scopeType}`)
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
          // Check existence even when both selections are empty and no new
          // grant would otherwise trigger a foreign-key check.
          const staff = await tx.staffMembers.findUnique({
            where: { id: staffId },
            select: { id: true },
          });
          if (!staff) throw new NotFoundException('الموظف غير موجود');

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
            .filter((g) => !selectedKeys.has(`${g.permissionId}:${g.scopeType}`))
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
        throw new ConflictException('تغيّرت الصلاحيات أثناء الحفظ. أعد المحاولة');
      }
      throw error;
    }
  }

  async editStaff(staffId: string, editStaffDto: EditStaffDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const staff = await tx.staffMembers.update({
          where: { id: staffId },
          data: {
            email: editStaffDto.email,
            fullName: editStaffDto.fullName,
            jobTitle: editStaffDto.jobTitle,
            phone: editStaffDto.phoneNumber,
            dateOfBirth: editStaffDto.dateOfBirth
          }
        });
        await this.audit.record(tx, {
          actorId: 'staff_admin', //TODO: change to current user
          actionType: 'STAFF_UPDATED',
          targetType: 'STAFF',
          targetId: staffId,
          isSuccess: true
        });
        return staff;
      });
    }
    catch (error: unknown) {
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

  async cancelPendingInvitation(staffId: string) {
    // Using deleteMany here because prisma.staffMembers.delete does not allow us to put more than one condition + deleteMany with unique id is the same.
    const { count } = await this.prisma.staffMembers.deleteMany({
      where: {
        id: staffId,
        status: 'PENDING',
      },
    });

    if (count === 0) {
      throw new NotFoundException('لم يتم العثور على الحساب المعلق');
    }
  }

  async showFilteredStaff(filterDto: FilteredStaffDto) {
    const { searchField, status, halaqa, role, page, limit } = filterDto;
    const skip = (page! - 1) * limit!;

    //validate foreign keys
    await this.validateRelations(halaqa, role);

    const where: Prisma.StaffMembersWhereInput = {};

    //define search parameters
    if (searchField) {
      where.OR = [
        { fullName: { contains: searchField, mode: 'insensitive' } },
        { jobTitle: { contains: searchField, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    else where.status = { not: StaffStatus.PENDING };
    if (halaqa) where.classAssignments = { some: { halaqaId: halaqa } };
    if (role) where.roleGrants = { some: { roleId: role } };
    //search
    return this.prisma.staffMembers.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async showStaffEditPage(staffId: string) {
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        email: true,
        fullName: true,
        jobTitle: true,
        nationalId: true,
        status: true,
        dateOfBirth: true,
        phone: true
      }
    })

    if (!staff)
      throw new NotFoundException('الموظف غير موجود');
    if (staff.status === "PENDING")
      throw new BadRequestException('لا يمكن التعديل: دعوة معلّقة')
    return staff;
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
    const staff = await this.prisma.staffMembers.findMany({
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


  async deactivateStaff(staffId: string, actorId: string) {
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        status: true,
        classAssignments: true,
        activityAssignments: true
      }
    })
    //validations
    if (!staff)
      throw new NotFoundException('can\'t find this employee')
    if (staff.status !== "ACTIVE")
      throw new ConflictException('staff member can\'t be deactivated')
    await this.validateStaffNotAloneInClassesAndActivities(staffId, staff.classAssignments, staff.activityAssignments);
    //changes
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.staffMembers.update({
          where: { id: staffId },
          data: { status: StaffStatus.INACTIVE }
        });
        await this.audit.record(tx, {
          actorId: actorId,
          targetType: 'STAFF',
          actionType: 'STAFF_DEACTIVATED',
          targetId: staffId,
          isSuccess: true
        })
      })
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
      where: { id: staffId },
      select: {
        id: true,
        status: true
      }
    })
    //validations
    if (!staff)
      throw new NotFoundException('can\'t find this employee')
    if (staff.status !== "INACTIVE")
      throw new ConflictException('staff member can\'t be activated')
    //changes
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.staffMembers.update({
          where: { id: staffId },
          data: { status: StaffStatus.ACTIVE }
        });
        await this.audit.record(tx, {
          actorId: actorId,
          targetType: 'STAFF',
          actionType: 'STAFF_ACTIVATED',
          targetId: staffId,
          isSuccess: true
        })
      })
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
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        status: true,
        classAssignments: true,
        activityAssignments: true
      }
    })
    //validations
    if (!staff)
      throw new NotFoundException('can\'t find this employee')
    if (staff.status !== StaffStatus.ACTIVE && staff.status !== StaffStatus.INACTIVE)
      throw new ConflictException('staff member can\'t be deleted')
    await this.validateStaffNotAloneInClassesAndActivities(staffId, staff.classAssignments, staff.activityAssignments);
    //changes
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.staffMembers.update({
          where: { id: staffId },
          data: { status: StaffStatus.DELETED }
        });
        await this.audit.record(tx, {
          actorId: actorId,
          targetType: 'STAFF',
          actionType: 'STAFF_DELETED',
          targetId: staffId,
          isSuccess: true
        })
      })
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

  async inviteStaff(inviteStaffDto: InviteStaffDto) {
    const { email, fullName, jobTitle } = inviteStaffDto;

    const normalizedEmail = email.trim().toLowerCase();

    const existingStaff = await this.prisma.staffMembers.findUnique({
      where: { email: normalizedEmail },
    });

    // Check if the Staff exist and not deleted.
    if (existingStaff && existingStaff.status !== StaffStatus.DELETED) {
      throw new ConflictException('This email already exist.');
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
    } satisfies Prisma.StaffMembersSelect;

    type StaffSummary = Prisma.StaffMembersGetPayload<{
      select: typeof select;
    }>;

    try {
      return await this.prisma.$transaction(async (tx) => {
        let staff: StaffSummary;

        // Check if the staff exist and deleted
        if (existingStaff && existingStaff.status === StaffStatus.DELETED) {
          // Change the status to pending
          staff = await tx.staffMembers.update({
            // We need the check here too, to prevent another invitation at the same time.
            where: {
              id: existingStaff.id,
              status: StaffStatus.DELETED,
            },
            data,
            select,
          });
        } else {
          staff = await tx.staffMembers.create({
            data,
            select,
          });
        }

        await this.audit.record(tx, {
          actorId: 'staff_admin', //TODO: make it current user
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
  private async validateStaffNotAloneInClassesAndActivities(staffId: string, classAssignments: StaffClassAssignments[],
    activityAssignments: StaffActivityAssignments[]) {
    const [halaqas, activities] = await Promise.all([
      this.prisma.halaqas.findMany({
        where: {
          id: { in: classAssignments.map(({ halaqaId }) => halaqaId) },
          staffAssignments: { some: { staffId } },
        },
        select: {
          name: true,
          _count: { select: { staffAssignments: true } },
        },
      }),
      this.prisma.activities.findMany({
        where: {
          id: { in: activityAssignments.map(({ activityId }) => activityId) },
          staffAssignments: { some: { staffId } },
        },
        select: {
          name: true,
          _count: { select: { staffAssignments: true } },
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
}
