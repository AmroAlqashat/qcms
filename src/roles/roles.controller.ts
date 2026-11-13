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
import { permission } from '../authorization/decorators/permissions-access.decorator';
import { CurrentPermissionScope } from '../authorization/decorators/current-permission-scope.decorator';
import { ScopeType } from '@prisma/client';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @permission({ permission_action: 'read', permission_resource: 'roles' })
  @Render('roles/roles-list')
  async ShowListRolesPage(@CurrentPermissionScope() scope: ScopeType) {
    const roles = await this.rolesService.listRoles(scope);

    return {
      activeNav: 'roles',
      roles,
      permissions: {
        canManageRoles: scope === ScopeType.CENTER_WIDE,
      },
    };
  }

  @Get('create')
  @permission({ permission_action: 'create', permission_resource: 'roles' })
  @Render('roles/roles-editor')
  async showCreateRolePage(@CurrentPermissionScope() scope: ScopeType) {
    const permissionsData = await this.rolesService.getPermissionsWithCategory(
      undefined,
      scope,
    );

    return {
      ...permissionsData,
      activeNav: 'roles',
    };
  }
  @Post('create')
  @permission({ permission_action: 'create', permission_resource: 'roles' })
  @UseFilters(RolesErrorFilter)
  async newRole(
    @Body() createRoleDto: CreateNewRoleDto,
    @CurrentUser() user: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.rolesService.createRole(createRoleDto, user.id, scope);
    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/roles');
      response.status(204).send();
      return;
    }
    response.redirect(303, '/roles');
  }

  @Get('edit/:id')
  @permission({ permission_action: 'update', permission_resource: 'roles' })
  @Render('roles/roles-editor')
  async showEditRolePage(
    @Param('id') roleId: string,
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    const [role, permissionsData, accountCount] = await Promise.all([
      this.rolesService.getRoleById(roleId, scope),
      this.rolesService.getPermissionsWithCategory(roleId, scope),
      this.rolesService.getRoleAccountCount(roleId, scope),
    ]);

    return {
      role,
      ...permissionsData,
      activeNav: 'roles',
      accountCount,
    };
  }
  @Post('edit/:id')
  @permission({ permission_action: 'update', permission_resource: 'roles' })
  @Redirect('/roles', 303)
  @UseFilters(RolesErrorFilter)
  async editedRole(
    @Body() editRoleDto: EditRoleDto,
    @Param('id') roleId: string,
    @CurrentUser() user: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    await this.rolesService.editRole(editRoleDto, roleId, user.id, scope);
  }

  @Get('delete/:id')
  @permission({ permission_action: 'delete', permission_resource: 'roles' })
  @Render('roles/roles-delete-dialog')
  async showDeleteRoleDialog(
    @Param('id') roleId: string,
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    const role = await this.rolesService.getRoleById(roleId, scope);

    return {
      role,
      activeNav: 'roles',
    };
  }
  @Post('delete/:id')
  @permission({ permission_action: 'delete', permission_resource: 'roles' })
  @UseFilters(RolesErrorFilter)
  async deletedRole(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id') roleId: string,
    @CurrentUser() user: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    await this.rolesService.deleteRole(roleId, user.id, scope);
    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/roles');
      response.status(204).send();
      return;
    }
    response.redirect(303, '/roles');
  }
}
