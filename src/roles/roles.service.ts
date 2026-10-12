import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditAction, AuditTarget, Prisma, ScopeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateNewRoleDto } from './dto/create-new-role.dto';
import { EditRoleDto } from './dto/edit-role.dto';
import { RolePermissionDto } from './dto/role-permission.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) { }

  async getRoleAccountCount(roleId: string) {
    const accountCount = await this.prisma.role.findFirst({
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
      throw new NotFoundException('القالب غير موجود')
    }

    return accountCount._count.staffGrants;
  }

  async deleteRole(roleId: string, actorId: string) {
    //validate if user may delete this role

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.role.delete({ where: { id: roleId } });

        await this.audit.record(tx, {
          actorId,
          actionType: AuditAction.ROLE_DELETED,
          targetType: AuditTarget.ROLE,
          targetId: roleId,
          isSuccess: true,
        });
      });
    }
    catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2003' || error.code === 'P2025'))
        throw new ConflictException({
          message: 'هاذ القالب غير موجود',
          errors: { name: 'هاذ القالب غير موجود' }
        });
    }
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
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

  async getPermissionsWithCategory(roleId?: string) {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [
        { category: 'asc' },
        { resource: 'asc' },
        { action: 'asc' },
      ],
      select: {
        id: true,
        category: true,
        resource: true,
        action: true,
        allowedScopes: true,
      },
    });

    const selectedRolePermissions = roleId
      ? await this.prisma.rolePermission.findMany({
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

    const permissionGroups = Object.values(
      permissions.reduce((acc, permission) => {
        acc[permission.category] ??= {
          category: permission.category,
          selectedCount: 0,
          resources: {},
        };

        acc[permission.category].resources[permission.resource] ??= {
          name: permission.resource,
          actions: [],
        };

        const selectedScope = permission.allowedScopes.find((scope) =>
          selectedKeys.has(`${permission.id}:${scope}`),
        );

        const isSelected = Boolean(selectedScope);

        if (isSelected) {
          acc[permission.category].selectedCount++;
        }

        acc[permission.category].resources[permission.resource].actions.push({
          id: permission.id,
          resource: permission.resource,
          action: permission.action,
          scopes: permission.allowedScopes,
          selected: isSelected,
          selectedScope,
        });

        return acc;
      }, {} as Record<string, any>),
    ).map((category) => ({
      ...category,
      resources: Object.values(category.resources),
    }));

    const selectedPermissionCount = permissionGroups.reduce(
      (total, group) => total + group.selectedCount,
      0,
    );

    const permissionColumns: typeof permissionGroups[] = [[], []];

    permissionGroups.forEach((group, index) => {
      permissionColumns[index % 2].push(group);
    });

    return {
      permissionColumns,
      selectedPermissionCount,
    };
  }

  async getRoleById(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId }
    });

    if (!role) {
      throw new NotFoundException('القالب غير موجود')
    }

    return role;
  }

  async createRole(createNewRoleDto: CreateNewRoleDto, actorId: string) {
    const { name, description, permissions } = createNewRoleDto;
    const normalizedName: string = name.trim().toLowerCase();

    // Check if role name exists
    await this.checkExistingRoleName(normalizedName);

    // Check for submitted twice permissions
    this.duplicatePermissionValidation(permissions);

    // Validate submitted roles
    const rows = await this.validateRoleValues(permissions);

    // Save the new role and audit
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({ data: { name: normalizedName, description } });

        await tx.rolePermission.createMany({
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          message: 'اسم القالب مستخدم بالفعل',
          errors: { name: 'اسم القالب مستخدم بالفعل' },
        });
      }
      throw error;
    }
  }

  async editRole(editRoleDto: EditRoleDto, roleId: string, actorId: string) {
    const { name, description, permissions } = editRoleDto;
    const normalizedName: string = name.trim().toLowerCase();

    //TODO: validate if user is allowed to edit this role and/or roles in general

    // Check if role name exists
    await this.checkExistingRoleName(normalizedName, roleId);

    // Check for submitted twice permissions
    this.duplicatePermissionValidation(permissions);

    // Check if the role we are trying to edit exist or not
    const oldRoleExists = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!oldRoleExists)
      throw new ConflictException({
        message: 'هاذ القالب غير موجود',
        errors: { name: 'هاذ القالب غير موجود' }
      });

    // Validate submitted roles
    const rows = await this.validateRoleValues(permissions);

    // Update the role and save to audit
    try {
      return await this.prisma.$transaction(async (tx) => {
        //update local role values
        const role = await tx.role.update({ where: { id: roleId }, data: { name: normalizedName, description } });

        //delete old role_perms
        await tx.rolePermission.deleteMany({ where: { roleId: roleId } });

        //create the new and updated role_perms
        await tx.rolePermission.createMany({
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          message: 'اسم القالب مستخدم بالفعل',
          errors: { name: 'اسم القالب مستخدم بالفعل' },
        });
      }
      throw error;
    }
  }

  private async checkExistingRoleName(roleName: string, excludeRoleId?: string) {
    // Check if the role name exist or not
    const roleNameExisting = await this.prisma.role.findUnique({
      where: { name: roleName },
      select: { id: true },
    });

    // To prevent finding its own name when not editing the name (editRole)
    if (roleNameExisting && roleNameExisting.id !== excludeRoleId) {
      throw new ConflictException({
        message: 'اسم القالب مستخدم بالفعل',
        errors: { name: 'اسم القالب مستخدم بالفعل' },
      });
    }
  }

  private duplicatePermissionValidation(permissions: RolePermissionDto[]) {
    //Check for the same (resource, action, scope) submitted twice
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

    const catalog = await this.prisma.permission.findMany({
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

    const key = (resource: string, action: string) =>
      JSON.stringify([resource, action]);

    const permissionsByKey = new Map(
      catalog.map((permission) => [
        key(permission.resource, permission.action),
        permission,
      ]),
    );

    return permissions.map((item) => {
      const permission = permissionsByKey.get(
        key(item.resource, item.action),
      );

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
