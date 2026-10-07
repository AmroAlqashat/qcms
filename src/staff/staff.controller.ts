import {
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  Post,
  Render,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { StaffService } from './staff.service';
import { wantsHtml } from '../common/wants-html';
import { staffShell } from './helpers/staff-shell';
import { InviteStaffErrorFilter } from './helpers/invite-staff-error.filter';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) { }

  @Get('invite')
  @Render('staff/invite-staff')
  showInviteForm() {
    return staffShell({
      title: 'دعوة موظف',
      form: {},
    });
  }

  @Post('invite')
  @UseFilters(InviteStaffErrorFilter)
  async inviteStaff(
    @Body() inviteStaffDto: InviteStaffDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {

    response.setHeader('Cache-Control', 'no-store');

    const result = await this.staffService.inviteStaff(inviteStaffDto);

    if (!wantsHtml(request)) {
      response.json(result);
      return;
    }

    response.render(
      'staff/invite-temp-password',
      staffShell({
        title: 'تم إنشاء الحساب',
        // TODO: compute from the permissions service once the cancel route exists
        permissions: { canCancelInvitation: false },
        ...result,
      }),
    );
  }
}
