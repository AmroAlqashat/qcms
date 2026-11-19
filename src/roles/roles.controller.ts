import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Render,
  Redirect,
  UseFilters,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RolesService } from './roles.service';
import { CreateNewRoleDto } from './dto/create-new-role.dto';
import { EditRoleDto } from './dto/edit-role.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesErrorFilter } from './helpers/roles-error.filter';
import { Permission } from '../authorization/decorators/permissions-access.decorator';
import { ActorEndpointPermissionScope } from '../authorization/decorators/actor-endpoint-permission-scope.decorator';
import { ScopeType } from '@prisma/client';
import { AuthorizationService } from '../authorization/authorization.service';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @Permission({ permission_action: 'read', permission_resource: 'roles' })
  @Render('roles/roles-list')
  async showListRolesPage(
    @ActorEndpointPermissionScope() actorEndpointPermissionScope: ScopeType,
    @CurrentUser() user: { id: string },
  ) {
    const roles = await this.rolesService.listRoles(
      actorEndpointPermissionScope,
    );

    return {
      activeNav: 'roles',
      roles,
      permissions: {
        canCreateRole: await this.authorizationService.hasPermission(
          user.id,
          'roles',
          'create',
          ScopeType.CENTER_WIDE,
        ),
        canEditRole: await this.authorizationService.hasPermission(
          user.id,
          'roles',
          'update',
          ScopeType.CENTER_WIDE,
        ),
      },
    };
  }

  @Get('create')
  @Permission({ permission_action: 'create', permission_resource: 'roles' })
  @Render('roles/roles-editor')
  async showCreateRolePage(
    @ActorEndpointPermissionScope() actorEndpointPermissionScope: ScopeType,
    @CurrentUser() user: { id: string },
  ) {
    const permissionsData = await this.rolesService.getPermissionsWithCategory(
      user.id,
      undefined,
      actorEndpointPermissionScope,
    );

    return {
      ...permissionsData,
      activeNav: 'roles',
    };
  }
  @Post('create')
  @Permission({ permission_action: 'create', permission_resource: 'roles' })
  @UseFilters(RolesErrorFilter)
  async newRole(
    @Body() createRoleDto: CreateNewRoleDto,
    @CurrentUser() user: { id: string },
    @ActorEndpointPermissionScope() actorEndpointPermissionScope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.rolesService.createRole(
      createRoleDto,
      user.id,
      actorEndpointPermissionScope,
    );
    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/roles');
      response.status(204).send();
      return;
    }
    response.redirect(303, '/roles');
  }

  @Get('edit/:id')
  @Permission({ permission_action: 'update', permission_resource: 'roles' })
  @Render('roles/roles-editor')
  async showEditRolePage(
    @CurrentUser() user: { id: string },
    @Param('id') roleId: string,
    @ActorEndpointPermissionScope() actorEndpointPermissionScope: ScopeType,
  ) {
    const [role, permissionsData, accountCount] = await Promise.all([
      this.rolesService.getRoleById(roleId, actorEndpointPermissionScope),
      this.rolesService.getPermissionsWithCategory(
        user.id,
        roleId,
        actorEndpointPermissionScope,
      ),
      this.rolesService.getRoleAccountCount(
        roleId,
        actorEndpointPermissionScope,
      ),
    ]);

    return {
      role,
      ...permissionsData,
      activeNav: 'roles',
      accountCount,
      canDeleteRole: await this.authorizationService.hasPermission(
        user.id,
        'roles',
        'delete',
        ScopeType.CENTER_WIDE,
      ),
    };
  }
  @Post('edit/:id')
  @Permission({ permission_action: 'update', permission_resource: 'roles' })
  @Redirect('/roles', 303)
  @UseFilters(RolesErrorFilter)
  async editedRole(
    @Body() editRoleDto: EditRoleDto,
    @Param('id') roleId: string,
    @CurrentUser() user: { id: string },
    @ActorEndpointPermissionScope() actorEndpointPermissionScope: ScopeType,
  ) {
    await this.rolesService.editRole(
      editRoleDto,
      roleId,
      user.id,
      actorEndpointPermissionScope,
    );
  }

  @Get('delete/:id')
  @Permission({ permission_action: 'delete', permission_resource: 'roles' })
  @Render('roles/roles-delete-dialog')
  async showDeleteRoleDialog(
    @Param('id') roleId: string,
    @ActorEndpointPermissionScope() actorEndpointPermissionScope: ScopeType,
  ) {
    const role = await this.rolesService.getRoleById(
      roleId,
      actorEndpointPermissionScope,
    );

    return {
      role,
      activeNav: 'roles',
    };
  }
  @Post('delete/:id')
  @Permission({ permission_action: 'delete', permission_resource: 'roles' })
  @UseFilters(RolesErrorFilter)
  async deletedRole(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id') roleId: string,
    @CurrentUser() user: { id: string },
    @ActorEndpointPermissionScope() actorEndpointPermissionScope: ScopeType,
  ) {
    await this.rolesService.deleteRole(
      roleId,
      user.id,
      actorEndpointPermissionScope,
    );
    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/roles');
      response.status(204).send();
      return;
    }
    response.redirect(303, '/roles');
  }
}
