import { Controller, Post, Body, Put, Param } from '@nestjs/common';
import { RolesService } from './roles.service';
import { NewRoleDto } from './dto/new-role.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) { }

  @Post('create')
  newRole(@Body() createRoleDto: NewRoleDto, @CurrentUser() user: { id: string }) {
    return this.rolesService.createRole(createRoleDto, user.id);
  }

  @Put(':edit/:rid')
  editedRole(@Body() newRoleDto: NewRoleDto, @Param('rid') roleId: string,  @CurrentUser() user: { id: string }){
    return this.rolesService.editRole(roleId, newRoleDto, user.id);
  }
}
