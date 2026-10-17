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
import { EditStaffErrorFilter } from './helpers/filters/edit-staff-error.filter';
import { InviteStaffErrorFilter } from './helpers/filters/invite-staff-error.filter';
import { FilteredStaffDto } from './dto/filter-staff.dto';
import { EditStaffDto } from './dto/edit-staff.dto';
import {
  formatStaffDate,
  formatStaffPhone,
  formatStaffStatus,
} from './helpers/staff-profile-formatters';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EditPermissionsDto } from './dto/edit-permissions.dto';

@Controller('staff')
export class StaffController {
  constructor(
    private readonly staffService: StaffService,
  ) { }

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
      permissions: {
        canInvite: true,
      },
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

  @Get('edit/permissions/:id')
  @Render('partials/staff/permissions-dialog')
  async showPermissionsDialog(@Param('id') staffId: string) {
    // GET: load the available choices and the staff member's active selections.
    // The partial uses selected/selectedScope to reopen the saved state.
    const [roles, permissions] = await Promise.all([
      this.staffService.getRoleOptionsForStaff(staffId),
      this.staffService.getPermissionOptionsForStaff(staffId),
    ]);

    return {
      roles,
      ...permissions,
      staffId,
    }
  }

  @Post('edit/permissions/:id')
  // The global ValidationPipe transforms and validates the submitted DTO
  // before this handler passes the target staff ID and acting user's ID onward.
  async editPermissions(
    @Param('id') staffId: string,
    @Body() editPermissionsDto: EditPermissionsDto,
    @CurrentUser() user: { id: string },
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.staffService.editPermissions(staffId, editPermissionsDto, user.id);

    // Respond only after the transaction succeeds. HX-Redirect navigates the
    // full page instead of swapping the profile HTML into the permissions dialog.
    const location = `/staff/${encodeURIComponent(staffId)}`;
    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', location).status(204).end();
      return;
    }
    // API callers receive JSON; ordinary form submissions use a GET redirect.
    if (!wantsHtml(request)) {
      response.json({ success: true });
      return;
    }
    response.redirect(303, location);
  }

  @Get('edit/:id')
  @Render('staff/staff-edit-profile-page')
  async showEditStaffForm(@Param('id') staffId: string) {
    const staff = await this.staffService.showStaffEditPage(staffId);

    return {
      staff: {
        ...staff,
        initial: staff.fullName.trim().charAt(0),
        dateOfBirthValue: staff.dateOfBirth?.toISOString().slice(0, 10) ?? '',
        permissions: {
          canChangeStatus: true,
        },
      },
    };
  }
  @Post('edit/:id')
  @UseFilters(EditStaffErrorFilter)
  async editStaff(
    @Param('id') id: string,
    @Body() editStaffDto: EditStaffDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.staffService.editStaff(id, editStaffDto);

    const location = `/staff/${encodeURIComponent(id)}`;

    if (!wantsHtml(request)) {
      response.json({ success: true });
      return;
    }

    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', location).status(204).end();
      return;
    }

    response.redirect(303, location);
  }

  @Get('invite')
  @Render('staff/staff-invitation-dialog')
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
      'partials/staff/credentials-dialog',
      staffShell({
        title: 'تم إنشاء الحساب',
        // TODO: compute from the permissions service once the cancel route exists
        permissions: { canCancelInvitation: false },
        ...result,
      }),
    );
  }

  @Get(':id')
  @Render('staff/staff-profile-page')
  async showStaffProfile(@Param('id') id: string) {
    const staff = await this.staffService.showStaffProfile(id);

    return {
      staff: {
        ...staff,
        initial: staff.fullName.trim().charAt(0),
        dateOfBirthLabel: formatStaffDate(staff.dateOfBirth),
        nationalIdLabel: staff.nationalId,
        phoneLabel: formatStaffPhone(staff.phone),
        statusLabel: formatStaffStatus(staff.status),
      },
      assignments: {
        classes: staff.classAssignments.map(({ halaqa }) => halaqa),
        activities: staff.activityAssignments.map(({ activity }) => activity),
        templates: staff.roleGrants.map(({ role }) => role),
        directGrantsLabel: 'تُتاح في إصدار لاحق',
      },
      permissions: {
        canEditStaff: true,
        canManagePermissions: true,
        canChangeStatus: true,
        canDelete: true,
      },
      effectivePermissionCount: 0,
      activeNav: 'staff',
    };
  }

  @Get('deactivate/:id')
  @Render('staff/staff-deactivate-page')
  async showDeactivateStaffDialog(@Param('id') staffId: string) {
    return {
      staff: { id: staffId }
    };
  }
  @Post('deactivate/:id')
  @Render('staff/staff-page')
  async deactivateStaff(@Param('id') staffId: string,
    @CurrentUser() actor: { id: string },
    @Req() request: Request,
    @Res() response: Response) {
    await this.staffService.deactivateStaff(staffId, actor.id);
    const location = '/staff';

    if (!wantsHtml(request)) {
      response.json({ success: true });
      return;
    }

    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', location).status(204).end();
      return;
    }

    response.redirect(303, location);
  }

  @Get('delete/:id')
  @Render('staff/staff-delete-page')
  async showDeleteStaffDialog(@Param('id') staffId: string) {
    return {
      staff: { id: staffId }
    };
  }
  @Post('delete/:id')
  @Render('staff/staff-page')
  async deleteStaff(@Param('id') staffId: string,
    @CurrentUser() actor: { id: string },
    @Req() request: Request,
    @Res() response: Response) {
    await this.staffService.deleteStaff(staffId, actor.id);
    const location = '/staff';

    if (!wantsHtml(request)) {
      response.json({ success: true });
      return;
    }

    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', location).status(204).end();
      return;
    }

    response.redirect(303, location);
    return;
  }

  @Get('activate/:id')
  @Render('staff/staff-activate-page')
  async showactivateStaffDialog(@Param('id') staffId: string) {
    return {
      staff: { id: staffId }
    };
  }
  @Post('activate/:id')
  @Render('staff/staff-page')
  async activateStaff(@Param('id') staffId: string,
    @CurrentUser() actor: { id: string },
    @Req() request: Request,
    @Res() response: Response,) {
    await this.staffService.activateStaff(staffId, actor.id);
    const location = '/staff';

    if (!wantsHtml(request)) {
      response.json({ success: true });
      return;
    }

    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', location).status(204).end();
      return;
    }

    response.redirect(303, location);
    return;
  }
}
