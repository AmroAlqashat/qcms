import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../../common/wants-html';
import { RolesService } from '../roles.service';

type SubmittedPermission = {
  resource: string;
  action: string;
  scope?: string;
};

@Catch(ConflictException, UnprocessableEntityException)
export class RolesErrorFilter implements ExceptionFilter {
  constructor(private readonly rolesService: RolesService) { }

  async catch(exception: HttpException, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

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

    // Use whichever name your route uses for the role id; delete the other one.
    const roleId = [request.params.id, request.params.rid].find(
      (value): value is string => typeof value === 'string',
    );

    // Nest does not catch errors thrown inside a filter, so load defensively.
    const editor = await this.loadEditor(roleId);
    if (!editor) {
      this.redirectToList(request, response);
      return;
    }
    const { role, permissionsData } = editor;

    const requestBody = request.body as Record<string, unknown>;
    const details =
      typeof body === 'object' && body !== null
        ? (body as { errors?: Record<string, string> })
        : {};

    permissionsData.selectedPermissionCount =
      this.restoreSubmittedPermissions(
        permissionsData.permissionColumns,
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

  private async loadEditor(roleId?: string) {
    try {
      const role = roleId
        ? await this.rolesService.getRoleById(roleId)
        : undefined;

      // Editing a role that no longer exists
      if (roleId && !role) {
        return null;
      }

      const permissionsData =
        await this.rolesService.getPermissionsWithCategory(roleId);

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
    permissionColumns: Array<
      Array<{
        selectedCount: number;
        resources: Array<{
          actions: Array<{
            resource: string;
            action: string;
            selected: boolean;
            selectedScope?: string;
          }>;
        }>;
      }>
    >,
    requestBody: Record<string, unknown>,
  ) {
    const submitted = this.parseSubmittedPermissions(
      requestBody.permissions,
      requestBody.scopes,
    );
    let selectedPermissionCount = 0;

    for (const column of permissionColumns) {
      for (const group of column) {
        group.selectedCount = 0;

        for (const resource of group.resources) {
          for (const action of resource.actions) {
            const selected = submitted.find(
              (permission) =>
                permission.resource === action.resource &&
                permission.action === action.action,
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
          typeof permission.resource === 'string' &&
          typeof permission.action === 'string'
        ) {
          return [
            {
              resource: permission.resource,
              action: permission.action,
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

      // Accept "resource::action" and "resource:action"
      const parts = entry.includes('::')
        ? entry.split('::', 2)
        : entry.split(':', 2);
      const [resource, action] = parts;
      if (!resource || !action) {
        return [];
      }

      const scope = scopes[`${resource}:${action}`] ?? scopes[resource];
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
