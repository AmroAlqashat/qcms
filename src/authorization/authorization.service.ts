import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, ScopeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PermissionAccess } from './decorators/permissions-access.decorator';

const scopePriority: ScopeType[] = [
  'CENTER_WIDE',
  'ASSIGNED_CLASS',
  'OWN_ACCOUNT',
];

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  // Read current assignment authority again inside the save transaction; never
  // trust the choices shown by an earlier GET request.
  async getAssignmentAccess(
    editorId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const editor = await db.staffMembers.findUnique({
      where: { id: editorId, isDeleted: false },
      select: {
        isSuperAdmin: true,
        roleGrants: {
          where: { revokedAt: null, role: { isSuperAdminRole: false } },
          select: {
            roleId: true,
            role: {
              select: {
                rolePermissions: {
                  select: {
                    permissionId: true,
                    scopeType: true,
                    permission: { select: { allowedScopes: true } },
                  },
                },
              },
            },
          },
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
    const addPermissionScope = (
      permissionId: string,
      scopeType: ScopeType,
      allowedScopes: ScopeType[],
    ) => {
      if (!allowedScopes.includes(scopeType)) return;
      const scopes = permissionScopes.get(permissionId) ?? new Set<ScopeType>();
      scopes.add(scopeType);
      permissionScopes.set(permissionId, scopes);
    };

    for (const grant of editor.directPermissionGrants) {
      addPermissionScope(
        grant.permissionId,
        grant.scopeType,
        grant.permission.allowedScopes,
      );
    }
    for (const assignment of editor.roleGrants) {
      for (const grant of assignment.role.rolePermissions) {
        addPermissionScope(
          grant.permissionId,
          grant.scopeType,
          grant.permission.allowedScopes,
        );
      }
    }
    return {
      isSuperAdmin: editor.isSuperAdmin,
      roleIds: editor.roleGrants.map((grant) => grant.roleId),
      permissionScopes,
    };
  }

  async getAllowedScope(
    staffId: string,
    requiredPermission: PermissionAccess,
  ): Promise<ScopeType> {
    const endpointPermission =
      await this.findEndpointPermission(requiredPermission);
    const staffGrants = await this.getStaffPermissionGrants(staffId);
    const staffGrantedScopes = new Set(
      staffGrants
        .filter((grant) => grant.permissionId === endpointPermission.id)
        .map((grant) => grant.scopeType),
    );
    const highestScope = scopePriority.find(
      (scope) =>
        endpointPermission.allowedScopes.includes(scope) &&
        staffGrantedScopes.has(scope),
    );

    if (!highestScope) {
      throw new ForbiddenException('ليس لديك صلاحية للوصول إلى هذا المورد');
    }

    return highestScope;
  }

  private async findEndpointPermission(permission: PermissionAccess) {
    const [action, resource] = await Promise.all([
      this.prisma.permission_actions.findUnique({
        where: { eng_name: permission.permission_action },
        select: { id: true },
      }),
      this.prisma.permission_resources.findUnique({
        where: { eng_name: permission.permission_resource },
        select: { id: true },
      }),
    ]);

    if (!action || !resource) {
      throw new NotFoundException('الإجراء أو المورد المطلوب غير موجود');
    }

    const endpointPermission = await this.prisma.permissions.findUnique({
      where: {
        resource_action: { action: action.id, resource: resource.id },
      },
      select: { id: true, allowedScopes: true },
    });

    if (!endpointPermission) {
      throw new NotFoundException(
        'لا توجد صلاحية لهذا الإجراء على المورد المحدد',
      );
    }

    return endpointPermission;
  }

  private async getStaffPermissionGrants(staffId: string) {
    const staff = await this.prisma.staffMembers.findUnique({
      where: { id: staffId },
      select: {
        roleGrants: {
          where: { revokedAt: null },
          select: {
            role: {
              select: {
                rolePermissions: {
                  select: { permissionId: true, scopeType: true },
                },
              },
            },
          },
        },
        directPermissionGrants: {
          where: { revokedAt: null },
          select: { permissionId: true, scopeType: true },
        },
      },
    });

    if (!staff) throw new NotFoundException('الموظف غير موجود');

    const grants = staff.directPermissionGrants.map((grant) => ({
      permissionId: grant.permissionId,
      scopeType: grant.scopeType,
    }));

    for (const assignment of staff.roleGrants) {
      for (const rolePermission of assignment.role.rolePermissions) {
        grants.push({
          permissionId: rolePermission.permissionId,
          scopeType: rolePermission.scopeType,
        });
      }
    }

    return grants;
  }
}
