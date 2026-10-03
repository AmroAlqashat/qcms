import { Controller, Post, Body } from '@nestjs/common';
import { StaffService } from './staff.service';
import { InviteStaffDto } from './dto/invite-staff.dto';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) { }

  @Post('invite')
  inviteStaff(@Body() inviteStaffDto: InviteStaffDto) {
    return this.staffService.inviteStaff(inviteStaffDto)
  }
}
