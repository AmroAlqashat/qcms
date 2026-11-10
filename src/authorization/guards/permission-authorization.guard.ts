import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ScopeType } from '@prisma/client';
import {
  permission,
  type PermissionAccess,
} from '../decorators/permissions-access.decorator';
import { AuthorizationService } from '../authorization.service';

type AuthenticatedRequest = Request & {
  user?: { id: string; isSuperAdmin: boolean };
  permissionScope?: ScopeType;
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
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

    request.permissionScope = await this.authorization.getAllowedScope(
      staffId,
      requiredPermission,
    );
    return true;
  }
}
