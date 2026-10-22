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

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Render('roles/roles-list')
  async ShowListRolesPage() {
    const roles = await this.rolesService.listRoles();

    return {
      activeNav: 'roles',
      roles,
      permissions: {
        canManageRoles: true,
      },
    };
  }

  @Get('create')
  @Render('roles/roles-editor')
  async showCreateRolePage() {
    const permissionsData =
      await this.rolesService.getPermissionsWithCategory();

    return {
      ...permissionsData,
      activeNav: 'roles',
    };
  }
  @Post('create')
  @Redirect('/roles', 303)
  @UseFilters(RolesErrorFilter)
  async newRole(
    @Body() createRoleDto: CreateNewRoleDto,
    @CurrentUser() user: { id: string },
  ) {
    await this.rolesService.createRole(createRoleDto, user.id);
  }

  @Get('edit/:id')
  @Render('roles/roles-editor')
  async showEditRolePage(@Param('id') roleId: string) {
    const [role, permissionsData, accountCount] = await Promise.all([
      this.rolesService.getRoleById(roleId),
      this.rolesService.getPermissionsWithCategory(roleId),
      this.rolesService.getRoleAccountCount(roleId),
    ]);

    return {
      role,
      ...permissionsData,
      activeNav: 'roles',
      accountCount,
    };
  }
  @Post('edit/:id')
  @Redirect('/roles', 303)
  @UseFilters(RolesErrorFilter)
  async editedRole(
    @Body() editRoleDto: EditRoleDto,
    @Param('id') roleId: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.rolesService.editRole(editRoleDto, roleId, user.id);
  }

  @Get('delete/:id')
  @Render('roles/roles-delete-dialog')
  async showDeleteRoleDialog(@Param('id') roleId: string) {
    const role = await this.rolesService.getRoleById(roleId);

    return {
      role,
      activeNav: 'roles',
    };
  }
  @Post('delete/:id')
  @UseFilters(RolesErrorFilter)
  async deletedRole(
    @Req() request: Request,
    @Res() response: Response,
    @Param('id') roleId: string,
    @CurrentUser() user: { id: string },
  ) {
    await this.rolesService.deleteRole(roleId, user.id);
    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/roles');
      response.status(204).send();
      return;
    }
    response.redirect(303, '/roles');
  }
}
