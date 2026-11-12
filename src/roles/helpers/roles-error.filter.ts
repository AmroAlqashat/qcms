import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../../common/wants-html';
import { RolesService } from '../roles.service';
import type { PermissionGroup } from '../helpers/roles.types';
import type { ScopeType } from '@prisma/client';

type PermissionScopedRequest = Request & { permissionScope?: ScopeType };

type SubmittedPermission = {
  resource: string;
  action: string;
  scope?: string;
};

@Catch(ConflictException, UnprocessableEntityException)
export class RolesErrorFilter implements ExceptionFilter {
  constructor(private readonly rolesService: RolesService) {}

  async catch(exception: HttpException, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<PermissionScopedRequest>();
    const response = context.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    const scope = request.permissionScope;
    if (!scope) {
      throw new ForbiddenException('No permission scope was resolved');
    }

    if (!wantsHtml(request)) {
      response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        );
      return;
    }

    const roleId = [request.params.id].find(
      (value): value is string => typeof value === 'string',
    );
    const requestBody = request.body as Record<string, unknown>;
    const details =
      typeof body === 'object' && body !== null
        ? (body as { errors?: Record<string, string> })
        : {};

    if (request.path.startsWith('/roles/delete/')) {
      const role = await this.loadRole(roleId, scope);

      if (!role) {
        this.redirectToList(request, response);
        return;
      }

      response
        .status(status)
        .setHeader('X-QCMS-Fragment', 'true')
        .render('roles/roles-delete-dialog', {
          activeNav: 'roles',
          role,
          errors: details.errors,
          error: details.errors ? undefined : exception.message,
        });
      return;
    }

    const editor = await this.loadEditor(roleId, scope);
    if (!editor) {
      this.redirectToList(request, response);
      return;
    }

    const { role, permissionsData } = editor;

    permissionsData.selectedPermissionCount = this.restoreSubmittedPermissions(
      permissionsData.permissionGroups,
      requestBody,
    );

    response
      .status(status)
      .setHeader('X-QCMS-Fragment', 'true')
      .render('roles/roles-editor', {
        activeNav: 'roles',
        role: {
          ...role,
          name:
            typeof requestBody.name === 'string'
              ? requestBody.name
              : role?.name,
          description:
            typeof requestBody.description === 'string'
              ? requestBody.description
              : role?.description,
        },
        ...permissionsData,
        errors: details.errors,
        error: details.errors ? undefined : exception.message,
      });
  }

  private async loadRole(roleId: string | undefined, scope: ScopeType) {
    if (!roleId) {
      return null;
    }

    try {
      return await this.rolesService.getRoleById(roleId, scope);
    } catch {
      return null;
    }
  }

  private async loadEditor(roleId: string | undefined, scope: ScopeType) {
    try {
      const role = roleId
        ? await this.rolesService.getRoleById(roleId, scope)
        : undefined;

      if (roleId && !role) {
        return null;
      }

      const permissionsData =
        await this.rolesService.getPermissionsWithCategory(roleId, scope);

      return { role, permissionsData };
    } catch {
      return null;
    }
  }

  private redirectToList(request: Request, response: Response) {
    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/roles').status(204).send();
    } else {
      response.redirect(303, '/roles');
    }
  }

  private restoreSubmittedPermissions(
    permissionGroups: PermissionGroup[],
    requestBody: Record<string, unknown>,
  ): number {
    const submitted = this.parseSubmittedPermissions(
      requestBody.permissions,
      requestBody.scopes,
    );
    let selectedPermissionCount = 0;

    for (const group of permissionGroups) {
      group.selectedCount = 0;

      for (const resource of group.resources) {
        for (const action of resource.actions) {
          const selected = submitted.find(
            (permission) =>
              permission.resource === String(action.resource) &&
              permission.action === String(action.action),
          );

          action.selected = selected !== undefined;
          action.selectedScope = selected?.scope;

          if (action.selected) {
            group.selectedCount++;
            selectedPermissionCount++;
          }
        }
      }
    }

    return selectedPermissionCount;
  }

  private parseSubmittedPermissions(
    value: unknown,
    scopesValue: unknown,
  ): SubmittedPermission[] {
    let entries: unknown = value;

    if (typeof entries === 'string') {
      try {
        entries = JSON.parse(entries);
      } catch {
        entries = [entries];
      }
    }

    const scopes =
      scopesValue && typeof scopesValue === 'object'
        ? (scopesValue as Record<string, unknown>)
        : {};
    const values = Array.isArray(entries) ? entries : [entries];

    return values.flatMap((entry): SubmittedPermission[] => {
      if (typeof entry === 'object' && entry !== null) {
        const permission = entry as Record<string, unknown>;

        if (
          (typeof permission.resource === 'string' ||
            typeof permission.resource === 'number') &&
          (typeof permission.action === 'string' ||
            typeof permission.action === 'number')
        ) {
          return [
            {
              resource: String(permission.resource),
              action: String(permission.action),
              scope:
                typeof permission.scope === 'string'
                  ? permission.scope
                  : undefined,
            },
          ];
        }
      }

      if (typeof entry !== 'string') {
        return [];
      }

      const parts = entry.includes('::')
        ? entry.split('::', 2)
        : entry.split(':', 2);
      const [resource, action] = parts;

      if (!resource || !action) {
        return [];
      }

      const scope =
        scopes[`${resource}::${action}`] ??
        scopes[`${resource}:${action}`] ??
        scopes[resource];

      return [
        {
          resource,
          action,
          scope: typeof scope === 'string' ? scope : undefined,
        },
      ];
    });
  }
}
