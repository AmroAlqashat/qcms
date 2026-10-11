import { Controller, Get, Post, Body, Param, Render, Redirect, UseFilters, Delete } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateNewRoleDto } from './dto/create-new-role.dto';
import { EditRoleDto } from './dto/edit-role.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesErrorFilter } from './helpers/roles-error.filter';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) { }

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
    const permissionsData = await this.rolesService.getPermissionsWithCategory();

    return {
      ...permissionsData,
      activeNav: 'roles',
    };
  }

  @Get('edit/:id')
  @Render('roles/roles-editor')
  async showEditRolePage(@Param('id') roleId: string) {
    const role = await this.rolesService.getRoleById(roleId);

    const permissionsData = await this.rolesService.getPermissionsWithCategory(roleId);

    return {
      role,
      ...permissionsData,
      activeNav: 'roles',
    };
  }

  @Get('delete/:id')
  @Render('roles/role-delete')
  async showDeleteRolePage(@Param('id') roleId: string){
    //TODO: show a confirmation dialog THEN after confirmation activate the delete post method THEN redirect to show-roles
    return null;
  }

  @Post('create')
  @Redirect('/roles')
  @UseFilters(RolesErrorFilter)
  async newRole(@Body() createRoleDto: CreateNewRoleDto, @CurrentUser() user: { id: string }) {
    await this.rolesService.createRole(createRoleDto, user.id);
  }

  @Post('edit/:id')
  @Redirect('/roles')
  @UseFilters(RolesErrorFilter)
  async editedRole(@Body() editRoleDto: EditRoleDto, @Param('id') roleId: string, @CurrentUser() user: { id: string }) {
    await this.rolesService.editRole(editRoleDto, roleId, user.id);
  }

  @Delete('delete/:id')
  @Redirect('/roles')
  @UseFilters(RolesErrorFilter)
  async deletedRole(@Param('id') roleId: string, @CurrentUser() user: {id: string}){
    await this.rolesService.deleteRole(roleId, user.id);
  }

}
