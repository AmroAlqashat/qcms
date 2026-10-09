import { Controller, Post, Body, Put, Param } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateNewRoleDto } from './dto/create-new-role.dto';
import { EditRoleDto } from './dto/edit-role.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) { }

  @Post('create')
  newRole(@Body() createRoleDto: CreateNewRoleDto, @CurrentUser() user: { id: string }) {
    return this.rolesService.createRole(createRoleDto, user.id);
  }

  @Put(':edit/:rid')
  editedRole(@Body() editRoleDto: EditRoleDto, @Param('rid') roleId: string, @CurrentUser() user: { id: string }) {
    return this.rolesService.editRole(roleId, editRoleDto, user.id);
  }
}
