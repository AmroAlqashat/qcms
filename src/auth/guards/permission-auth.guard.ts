import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ScopeType } from '@prisma/client';
import {
  permission,
  type PermissionAccess,
} from '../decorators/permissions-access.decorator';
import { PrismaService } from '../../prisma/prisma.service';

type AuthenticatedRequest = Request & {
  user?: { id: string; isSuperAdmin: boolean };
  permissionScope?: ScopeType;
};

const scopePriority: ScopeType[] = [
  'CENTER_WIDE',
  'ASSIGNED_CLASS',
  'OWN_ACCOUNT',
];

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission =
      this.reflector.getAllAndOverride<PermissionAccess>(permission, [
        context.getHandler(),
        context.getClass(),
      ]);

    if (!requiredPermission) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const staffId = request.user?.id;
    if (!staffId) throw new UnauthorizedException();

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

    request.permissionScope = highestScope;
    return true;
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
        RoleStaffAssignments: {
          where: { revokedAt: null },
          select: {
            Roles: {
              select: {
                RolePermissions: {
                  select: { permissionId: true, scopeType: true },
                },
              },
            },
          },
        },
        DirectPermissionGrants: {
          where: { revokedAt: null },
          select: { permissionId: true, scopeType: true },
        },
      },
    });

    if (!staff) throw new NotFoundException('No such staff member');

    const grants = staff.DirectPermissionGrants.map((grant) => ({
      permissionId: grant.permissionId,
      scopeType: grant.scopeType,
    }));

    for (const assignment of staff.RoleStaffAssignments) {
      for (const rolePermission of assignment.Roles.RolePermissions) {
        grants.push({
          permissionId: rolePermission.permissionId,
          scopeType: rolePermission.scopeType,
        });
      }
    }

    return grants;
  }
}
