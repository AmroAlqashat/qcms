import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthorizationService } from '../../authorization/authorization.service';
import { ScopeType } from '@prisma/client';

@Injectable()
export class NavigationPermissionsInterceptor implements NestInterceptor {
  constructor(private readonly authorizationSerivce: AuthorizationService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    // This interceptor run just before controllers and after guards.
    // Auth guard will validate user session and add req.user to teh request,
    // if valid there is req.user if not guard will reject it.
    // The optional user is for public or onboarding routes.
    // Here we are getting the request and expecting a request with type Request + user?.
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string; isSuperAdmin: boolean } }>();

    // If there is no user then its an endpoint the auth guard didnt validate user into request
    if (!request.user) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();

    // Adding these flages in locals so UI can use them.
    // The purpos of this interceptor to not add these flags in controller return for each controller in the system.
    // And why this interceptor runs before controller and not after because some controller in the system do res.render directly.
    response.locals.navigationPermissions = {
      canViewStaff: await this.authorizationSerivce.hasPermission(
        request.user.id,
        'staff_members',
        'read',
        ScopeType.CENTER_WIDE,
      ),
      canViewRoles: await this.authorizationSerivce.hasPermission(
        request.user.id,
        'roles',
        'read',
        ScopeType.CENTER_WIDE,
      ),
      canViewSettings: await this.authorizationSerivce.hasPermission(
        request.user.id,
        'settings',
        'read',
        ScopeType.CENTER_WIDE,
      ),
      canViewForms: await this.authorizationSerivce.hasPermission(
        request.user.id,
        'forms',
        'read',
        ScopeType.CENTER_WIDE,
      ),
      canViewTerms: await this.authorizationSerivce.hasPermission(
        request.user.id,
        'terms',
        'read',
        ScopeType.CENTER_WIDE,
      ),
      canViewActivities:
        (await this.authorizationSerivce.hasPermission(
          request.user.id,
          'activities',
          'read',
          ScopeType.CENTER_WIDE,
        )) ||
        (await this.authorizationSerivce.hasPermission(
          request.user.id,
          'activities',
          'read',
          ScopeType.ASSIGNED_CLASS,
        )),
    };

    return next.handle();
  }
}
