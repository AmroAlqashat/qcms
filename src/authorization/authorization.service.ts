import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ScopeType } from '@prisma/client';
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
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
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
      throw new NotFoundException('No such permission action or resource');
    }

    const endpointPermission = await this.prisma.permissions.findUnique({
      where: {
        resource_action: { action: action.id, resource: resource.id },
      },
      select: { id: true, allowedScopes: true },
    });

    if (!endpointPermission) {
      throw new NotFoundException(
        'No permission exists for this action and resource',
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

    if (!staff) throw new NotFoundException('No such staff member');

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
