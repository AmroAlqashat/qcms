import { AuthorizationService } from '../authorization/authorization.service';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, AuditTarget, Prisma, ScopeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateNewRoleDto } from './dto/create-new-role.dto';
import { EditRoleDto } from './dto/edit-role.dto';
import { RolePermissionDto } from './dto/role-permission.dto';
import type { PermissionsData } from './helpers/roles.types';
import {
  buildPermissionsData,
  permissionCatalogQuery,
} from './helpers/permission-view';
import { canAssignScope } from '../authorization/helpers/can-assign-scope';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  assertActorEndpointCenterWideScope(
    actorEndpointPermissionScope: ScopeType,
  ): void {
    if (actorEndpointPermissionScope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException(
        'يتطلب هذا الإجراء صلاحية إدارة القوالب على مستوى المركز',
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

  async getRoleAccountCount(
    roleId: string,
    actorEndpointPermissionScope: ScopeType,
  ) {
    this.assertActorEndpointCenterWideScope(actorEndpointPermissionScope);
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

  async deleteRole(
    roleId: string,
    actorId: string,
    actorEndpointPermissionScope: ScopeType,
  ) {
    this.assertActorEndpointCenterWideScope(actorEndpointPermissionScope);
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

  async listRoles(actorEndpointPermissionScope: ScopeType) {
    this.assertActorEndpointCenterWideScope(actorEndpointPermissionScope);
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
    actorId: string,
    roleId?: string,
    actorEndpointPermissionScope?: ScopeType,
  ): Promise<PermissionsData> {
    if (actorEndpointPermissionScope)
      this.assertActorEndpointCenterWideScope(actorEndpointPermissionScope);

    const access = await this.authorizationService.getAssignmentAccess(actorId);

    const permissions = await this.prisma.permissions.findMany({
      where: access.isSuperAdmin
        ? {}
        : {
            id: {
              in: [...access.permissionScopes.keys()],
            },
          },
      ...permissionCatalogQuery,
      select: {
        ...permissionCatalogQuery.select,
        rolePermissions: {
          // A new role has no saved selections.
          where: { roleId: roleId ?? '' },
          select: { scopeType: true },
        },
      },
    });

    const availablePermissions = access.isSuperAdmin
      ? permissions
      : permissions
          // Keep actions with an unmanageable saved scope out of the single-scope editor.
          .filter((permission) =>
            permission.rolePermissions.every((grant) =>
              canAssignScope(
                access.permissionScopes.get(permission.id),
                grant.scopeType,
              ),
            ),
          )
          .map((permission) => ({
            ...permission,
            allowedScopes: permission.allowedScopes.filter((requestedScope) =>
              canAssignScope(
                access.permissionScopes.get(permission.id),
                requestedScope,
              ),
            ),
          }));

    return buildPermissionsData(availablePermissions, (permission) =>
      permission.rolePermissions.map((grant) => grant.scopeType),
    );
  }

  async getRoleById(roleId: string, actorEndpointPermissionScope: ScopeType) {
    this.assertActorEndpointCenterWideScope(actorEndpointPermissionScope);
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
    actorEndpointPermissionScope: ScopeType,
  ) {
    this.assertActorEndpointCenterWideScope(actorEndpointPermissionScope);

    const { name, description, permissions } = createNewRoleDto;
    const normalizedName: string = name.trim().toLowerCase();

    await this.checkExistingRoleName(normalizedName);
    this.duplicatePermissionValidation(permissions);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const rows = await this.validateRoleValues(permissions, tx);
          await this.assertCanAssignPermissions(actorId, rows, tx);

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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'تغيّرت الصلاحيات أثناء الحفظ. أعد المحاولة',
        );
      }
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
    actorEndpointPermissionScope: ScopeType,
  ) {
    this.assertActorEndpointCenterWideScope(actorEndpointPermissionScope);
    const { name, description, permissions } = editRoleDto;
    const normalizedName: string = name.trim().toLowerCase();

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

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.assertRoleManageable(roleId, tx);
          const rows = await this.validateRoleValues(permissions, tx);
          const access = await this.assertCanAssignPermissions(
            actorId,
            rows,
            tx,
          );
          const existing = await tx.rolePermissions.findMany({
            where: { roleId },
          });
          const blockedPermissionIds = new Set(
            existing
              .filter(
                (grant) =>
                  !access.isSuperAdmin &&
                  !canAssignScope(
                    access.permissionScopes.get(grant.permissionId),
                    grant.scopeType,
                  ),
              )
              .map((grant) => grant.permissionId),
          );
          if (rows.some((row) => blockedPermissionIds.has(row.permissionId))) {
            throw new ForbiddenException(
              'لا يمكنك تعديل صلاحية لها نطاق خارج صلاحياتك',
            );
          }
          const removableIds = existing
            .filter((grant) => !blockedPermissionIds.has(grant.permissionId))
            .map((grant) => grant.id);
          const role = await tx.roles.update({
            where: { id: roleId },
            data: { name: normalizedName, description },
          });

          // Replace only visible, manageable actions; retain hidden permissions and scopes.
          await tx.rolePermissions.deleteMany({
            where: { roleId, id: { in: removableIds } },
          });

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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'تغيّرت الصلاحيات أثناء الحفظ. أعد المحاولة',
        );
      }
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

  private async assertCanAssignPermissions(
    actorId: string,
    rows: { permissionId: string; scopeType: ScopeType }[],
    tx: Prisma.TransactionClient,
  ) {
    // Reload authority in the save transaction, rather than trusting the GET form.
    const access = await this.authorizationService.getAssignmentAccess(
      actorId,
      tx,
    );
    if (!access.isSuperAdmin) {
      for (const row of rows) {
        // Missing permission IDs return undefined; the helper rejects those as
        // well as scopes beyond the actor's authority. Superadmin bypasses this
        // restriction, but catalog validation still applies.
        const actorScopes = access.permissionScopes.get(row.permissionId);
        if (!canAssignScope(actorScopes, row.scopeType)) {
          throw new ForbiddenException(
            'لا يمكنك إسناد صلاحية أو نطاق غير ممنوح لك',
          );
        }
      }
    }
    return access;
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

  private async validateRoleValues(
    permissions: RolePermissionDto[],
    db: Prisma.TransactionClient = this.prisma,
  ) {
    if (permissions.length === 0) return [];

    const catalog = await db.permissions.findMany({
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
