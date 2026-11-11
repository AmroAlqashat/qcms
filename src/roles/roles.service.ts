import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, AuditTarget, Prisma, ScopeType } from '@prisma/client';
import { scopeLabels } from '../common/scope-labels-map';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateNewRoleDto } from './dto/create-new-role.dto';
import { EditRoleDto } from './dto/edit-role.dto';
import { RolePermissionDto } from './dto/role-permission.dto';
import type {
  PermissionColumns,
  PermissionGroup,
  PermissionGroupDraft,
  PermissionsData,
} from './helpers/roles.types';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  assertCenterWideScope(scope: ScopeType): void {
    if (scope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException(
        'This operation requires center-wide role permission',
      );
    }
  }

  async assertRoleManageable(
    roleId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const role = await db.roles.findUnique({
      where: { id: roleId },
      select: { isSuperAdminRole: true },
    });
    if (!role) throw new NotFoundException('القالب غير موجود');
    if (role.isSuperAdminRole)
      throw new ForbiddenException('لا يمكن تعديل أو حذف قالب مدير النظام');
  }

  async getRoleAccountCount(roleId: string, scope: ScopeType) {
    this.assertCenterWideScope(scope);
    const accountCount = await this.prisma.roles.findFirst({
      where: { id: roleId },
      select: {
        _count: {
          select: {
            staffGrants: true,
          },
        },
      },
    });

    if (!accountCount) {
      throw new NotFoundException('القالب غير موجود');
    }

    return accountCount._count.staffGrants;
  }

  async deleteRole(roleId: string, actorId: string, scope: ScopeType) {
    this.assertCenterWideScope(scope);
    //validate if user may delete this role

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertRoleManageable(roleId, tx);
        await tx.roles.delete({ where: { id: roleId } });

        await this.audit.record(tx, {
          actorId,
          actionType: AuditAction.ROLE_DELETED,
          targetType: AuditTarget.ROLE,
          targetId: roleId,
          isSuccess: true,
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2003' || error.code === 'P2025')
      )
        throw new ConflictException({
          message: 'هاذ القالب غير موجود',
          errors: { name: 'هاذ القالب غير موجود' },
        });
      throw error;
    }
  }

  async getRoles() {
    return await this.prisma.roles.findMany({
      where: { isSuperAdminRole: false },
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getUsedRoles(staffId: string) {
    const usedRoles = await this.prisma.roleStaffAssignments.findMany({
      where: { staffId, revokedAt: null },
      select: { roleId: true },
    });

    return usedRoles;
  }

  async listRoles(scope: ScopeType) {
    this.assertCenterWideScope(scope);
    const roles = await this.prisma.roles.findMany({
      where: { isSuperAdminRole: false },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        _count: {
          select: {
            rolePermissions: true,
            staffGrants: true,
          },
        },
      },
    });

    return roles;
  }

  async getPermissionsWithCategory(
    roleId?: string,
    scope?: ScopeType,
  ): Promise<PermissionsData> {
    if (scope) this.assertCenterWideScope(scope);
    const permissions = await this.prisma.permissions.findMany({
      orderBy: [{ category: 'asc' }, { resource: 'asc' }, { action: 'asc' }],
      select: {
        id: true,
        category: true,
        resource: true,
        action: true,
        allowedScopes: true,
        permission_resources: {
          select: { arb_name: true },
        },
        permission_actions: {
          select: { arb_name: true },
        },
      },
    });

    const selectedRolePermissions = roleId
      ? await this.prisma.rolePermissions.findMany({
          where: { roleId },
          select: {
            permissionId: true,
            scopeType: true,
          },
        })
      : [];

    const selectedKeys = new Set(
      selectedRolePermissions.map((rp) => `${rp.permissionId}:${rp.scopeType}`),
    );

    const grouped = permissions.reduce<Record<number, PermissionGroupDraft>>(
      (acc, permission) => {
        const group = (acc[permission.category] ??= {
          category: permission.category,
          selectedCount: 0,
          resources: {},
        });

        const resource = (group.resources[permission.resource] ??= {
          name: permission.permission_resources.arb_name,
          actions: [],
        });

        const selectedScope = permission.allowedScopes.find((scope) =>
          selectedKeys.has(`${permission.id}:${scope}`),
        );
        const isSelected = selectedScope !== undefined;

        if (isSelected) {
          group.selectedCount++;
        }

        resource.actions.push({
          id: permission.id,
          resource: permission.resource,
          action: permission.action,
          actionName: permission.permission_actions.arb_name,
          scopes: permission.allowedScopes,
          scopeOptions: permission.allowedScopes.map((scope) => ({
            value: scope,
            label: scopeLabels[scope],
          })),
          selected: isSelected,
          selectedScope,
        });

        return acc;
      },
      {},
    );

    const permissionGroups: PermissionGroup[] = Object.values(grouped).map(
      ({ resources, ...group }) => ({
        ...group,
        resources: Object.values(resources),
      }),
    );

    const selectedPermissionCount = permissionGroups.reduce(
      (total, group) => total + group.selectedCount,
      0,
    );

    const permissionColumns: PermissionColumns = [[], []];

    permissionGroups.forEach((group, index) => {
      permissionColumns[index % 2].push(group);
    });

    return {
      permissionColumns,
      selectedPermissionCount,
    };
  }

  async getRoleById(roleId: string, scope: ScopeType) {
    this.assertCenterWideScope(scope);
    await this.assertRoleManageable(roleId);
    const role = await this.prisma.roles.findUnique({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException('القالب غير موجود');
    }

    return role;
  }

  async createRole(
    createNewRoleDto: CreateNewRoleDto,
    actorId: string,
    scope: ScopeType,
  ) {
    this.assertCenterWideScope(scope);
    const { name, description, permissions } = createNewRoleDto;
    const normalizedName: string = name.trim().toLowerCase();

    await this.checkExistingRoleName(normalizedName);
    this.duplicatePermissionValidation(permissions);
    const rows = await this.validateRoleValues(permissions);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.roles.create({
          data: { name: normalizedName, description },
        });

        await tx.rolePermissions.createMany({
          data: rows.map((row) => ({ ...row, roleId: role.id })),
        });

        await this.audit.record(tx, {
          actorId,
          actionType: AuditAction.ROLE_CREATED,
          targetType: AuditTarget.ROLE,
          targetId: role.id,
          isSuccess: true,
        });

        return role;
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'اسم القالب مستخدم بالفعل',
          errors: { name: 'اسم القالب مستخدم بالفعل' },
        });
      }
      throw error;
    }
  }

  async editRole(
    editRoleDto: EditRoleDto,
    roleId: string,
    actorId: string,
    scope: ScopeType,
  ) {
    this.assertCenterWideScope(scope);
    const { name, description, permissions } = editRoleDto;
    const normalizedName: string = name.trim().toLowerCase();

    //TODO: validate if user is allowed to edit this role and/or roles in general

    await this.checkExistingRoleName(normalizedName, roleId);
    this.duplicatePermissionValidation(permissions);

    const oldRoleExists = await this.prisma.roles.findUnique({
      where: { id: roleId },
    });
    if (!oldRoleExists)
      throw new ConflictException({
        message: 'هاذ القالب غير موجود',
        errors: { name: 'هاذ القالب غير موجود' },
      });

    const rows = await this.validateRoleValues(permissions);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertRoleManageable(roleId, tx);
        const role = await tx.roles.update({
          where: { id: roleId },
          data: { name: normalizedName, description },
        });

        await tx.rolePermissions.deleteMany({ where: { roleId } });

        await tx.rolePermissions.createMany({
          data: rows.map((row) => ({ ...row, roleId: role.id })),
        });

        await this.audit.record(tx, {
          actorId,
          actionType: AuditAction.ROLE_UPDATED,
          targetType: AuditTarget.ROLE,
          targetId: role.id,
          isSuccess: true,
        });

        return role;
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'اسم القالب مستخدم بالفعل',
          errors: { name: 'اسم القالب مستخدم بالفعل' },
        });
      }
      throw error;
    }
  }

  private async checkExistingRoleName(
    roleName: string,
    excludeRoleId?: string,
  ) {
    const roleNameExisting = await this.prisma.roles.findUnique({
      where: { name: roleName },
      select: { id: true },
    });

    if (roleNameExisting && roleNameExisting.id !== excludeRoleId) {
      throw new ConflictException({
        message: 'اسم القالب مستخدم بالفعل',
        errors: { name: 'اسم القالب مستخدم بالفعل' },
      });
    }
  }

  private duplicatePermissionValidation(permissions: RolePermissionDto[]) {
    const keys = permissions.map((p) => `${p.resource}:${p.action}:${p.scope}`);
    if (new Set(keys).size !== keys.length) {
      throw new UnprocessableEntityException({
        message: 'صلاحيات مكررة',
        errors: { permissions: 'تم تحديد صلاحية أكثر من مرة' },
      });
    }
  }

  private async validateRoleValues(permissions: RolePermissionDto[]) {
    if (permissions.length === 0) return [];

    const catalog = await this.prisma.permissions.findMany({
      where: {
        OR: permissions.map(({ resource, action }) => ({
          resource,
          action,
        })),
      },
      select: {
        id: true,
        resource: true,
        action: true,
        allowedScopes: true,
      },
    });

    const key = (resource: number, action: number) =>
      JSON.stringify([resource, action]);

    const permissionsByKey = new Map(
      catalog.map((permission) => [
        key(permission.resource, permission.action),
        permission,
      ]),
    );

    return permissions.map((item) => {
      const permission = permissionsByKey.get(key(item.resource, item.action));

      if (!permission) {
        throw new UnprocessableEntityException({
          message: 'صلاحية غير موجودة',
          errors: {
            permissions: `صلاحية غير موجودة: ${item.resource} / ${item.action}`,
          },
        });
      }

      if (!permission.allowedScopes.includes(item.scope)) {
        throw new UnprocessableEntityException({
          message: 'نطاق غير مسموح',
          errors: {
            permissions: `النطاق غير مسموح للصلاحية: ${item.resource} / ${item.action}`,
          },
        });
      }

      return {
        permissionId: permission.id,
        scopeType: item.scope,
      };
    });
  }
}
