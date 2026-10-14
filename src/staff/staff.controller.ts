import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
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
import { EditStaffDto } from './dto/staff-edit.dto';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Render('staff/staff-page')
  async showStaffPage(@Query() filterDto: FilteredStaffDto) {
    const [staffList, filterOptions] = await Promise.all([
      this.staffService.showFilteredStaff(filterDto),
      this.staffService.showStaffFilterOptions(
        filterDto.halaqa,
        filterDto.role,
      ),
    ]);
    return {
      staffList,
      filters: filterDto,
      filterOptions,
      activeNav: 'staff',
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

  @Post('invitations/cancel/:id')
  async cancelPendingInvitation(@Param('id') staffId: string) {
    await this.staffService.cancelPendingInvitation(staffId);

    return { success: true };
  }

  @Get(':id/edit')
  @Render('staff/staff-edit-profile-page')
  async showEditStaffForm(@Param('id') staffId:string){
    const staff = await this.staffService.showStaffEditPage(staffId);

    return{
      staff: {
        ...staff,
        initial: staff.fullName.trim().charAt(0),
        dateOfBirthLabel: staff.dateOfBirth?.toLocaleDateString('ar'),
      },
    }
  }
  @Post(':id/edit')
  @Redirect('/staff/:id')
  async editStaff(@Param('id') id: string, @Body() editStaffDto: EditStaffDto){
    const newStaff = this.staffService.editStaff(id, editStaffDto)
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
  async showStaffProfile(@Param('id') id: string) {
    const staff = await this.staffService.showStaffProfile(id);

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
        canEditStaff: true,
        canManageAssignments: true,
        canDeactivate: true,
        canDelete: true,
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
