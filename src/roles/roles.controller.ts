import { Controller, Post, Body } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) { }

  @Post('create')
  newRole(@Body() createRoleDto: CreateRoleDto, @CurrentUser() user: { id: string }) {
    return this.rolesService.createRole(createRoleDto, user.id);
  }
}
