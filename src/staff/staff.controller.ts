import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { FilteredStaffDto } from './dto/filter-staff.dto';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) { }

  @Get()
  @Render('staff/staff-page')
  async showStaffPage(@Query() filterDto: FilteredStaffDto) {
    const [staffList, filterOptions] = await Promise.all([
      this.staffService.showFilteredStaff(filterDto),
      this.staffService.showStaffFilterOptions(filterDto.halaqa, filterDto.role),
    ]);
    return {
      staffList,
      filters: filterDto,
      filterOptions,
      activeNav: 'staff'
    };
  }

  @Get('invitations')
  @Render('staff/pending-invitations-page')
  async showStaffInvitationPage() {
    const invitations = await this.staffService.showPendingStaff();

    return {
      invitations: invitations.map((invite) => ({
        ...invite,
        canCancel: true,
      })),
      activeNav: 'staff',
    };
  }

  @Get('invite')
  @Render('staff/staff-invitation-page')
  showInviteForm() {
    return staffShell({
      title: 'دعوة موظف',
      form: {},
    });
  }

  @Get(':id')
  @Render('staff/staff-profile-page')
  async showOneStaff(@Param('id') id: string) {
    const staff = await this.staffService.showOneStaff(id);

    return {
      staff: {
        ...staff,
        initial: staff.fullName.trim().charAt(0),
        dateOfBirthLabel: staff.dateOfBirth?.toLocaleDateString('ar'),
      },
      assignments: {
        classes: staff.classAssignments.map(({ halaqa }) => halaqa),
        activities: staff.activityAssignments.map(({ activity }) => activity),
        templates: staff.roleGrants.map(({ role }) => role),
        directGrantsLabel: 'تُتاح في إصدار لاحق',
      },
      permissions: {
        canEditStaff: false,
        canManageAssignments: false,
        canDeactivate: false,
        canDelete: false,
      },
      effectivePermissionCount: 0,
      activeNav: 'staff',
    };
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
      'staff/temporary-password-page',
      staffShell({
        title: 'تم إنشاء الحساب',
        // TODO: compute from the permissions service once the cancel route exists
        permissions: { canCancelInvitation: false },
        ...result,
      }),
    );
  }
}
