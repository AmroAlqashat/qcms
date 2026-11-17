import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
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
import {
  ROUTE_ACCESS,
  type RouteAccess,
} from '../../auth/decorators/route-access.decorator';

type AuthenticatedRequest = Request & {
  user?: { id: string; isSuperAdmin: boolean };
  actorEndpointPermissionScope?: ScopeType;
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

    const access = this.reflector.getAllAndOverride<RouteAccess>(ROUTE_ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Public and onboarding routes do not establish request.user.
    if (
      (access?.kind === 'public' || access?.kind === 'onboarding') &&
      !requiredPermission
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const staffId = request.user?.id;
    if (!staffId) throw new UnauthorizedException('يرجى تسجيل الدخول أولًا');

    if (access?.kind === 'authenticated' && !requiredPermission) return true;

    if (!requiredPermission) {
      throw new ForbiddenException('ليس لديك صلاحية للوصول إلى هذه الصفحة');
    }

    request.actorEndpointPermissionScope =
      await this.authorization.getAllowedScope(staffId, requiredPermission);
    return true;
  }
}
