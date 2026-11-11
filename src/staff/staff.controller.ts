import { ForgotPasswordDto } from './dto/forgot-password.dto';
import {
  ConfirmEmailChangeDto,
  RequestEmailChangeDto,
} from './dto/change-email.dto';
import { AccountSecurityErrorFilter } from './helpers/filters/account-security-error.filter';
import { accountSecurityView } from './helpers/account-security-view';
import {
  regenerateSession,
  saveSession,
} from '../auth/helpers/sessions.helpers';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
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
import { ChangeMyPasswordDto } from './dto/change-my-password.dto';
import { ForgotPasswordEmailDto } from './dto/forgot-password-email.dto';
import { Public } from '../auth/decorators/route-access.decorator';
import { permission } from '../authorization/decorators/permissions-access.decorator';
import { CurrentPermissionScope } from '../authorization/decorators/current-permission-scope.decorator';
import { ScopeType } from '@prisma/client';

@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @permission({ permission_action: 'read', permission_resource: 'staff' })
  @Render('staff/staff-page')
  async showStaffPage(
    @Query() filterDto: FilteredStaffDto,
    @CurrentUser() actor: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    const [staffList, filterOptions] = await Promise.all([
      this.staffService.showFilteredStaff(filterDto, actor.id, scope),
      scope === ScopeType.CENTER_WIDE
        ? this.staffService.showStaffFilterOptions(
            filterDto.halaqa,
            filterDto.role,
          )
        : Promise.resolve({ classes: [], templates: [] }),
    ]);
    return {
      staffList,
      filters: filterDto,
      filterOptions,
      permissions: {
        canInvite: scope === ScopeType.CENTER_WIDE,
      },
      activeNav: 'staff',
    };
  }

  @Get('invitations')
  @permission({ permission_action: 'read', permission_resource: 'staff' })
  @Render('staff/pending-invitations-page')
  async showStaffInvitationPage(@CurrentPermissionScope() scope: ScopeType) {
    const invitations = await this.staffService.showPendingStaff(scope);

    return {
      invitations: invitations.map((invite) => ({
        ...invite,
        canCancel: true,
      })),
      activeNav: 'staff',
    };
  }
  @Post('invitations/cancel/:id')
  @permission({ permission_action: 'delete', permission_resource: 'staff' })
  async cancelPendingInvitation(
    @Param('id') staffId: string,
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    await this.staffService.cancelPendingInvitation(staffId, scope);

    return { success: true };
  }

  @Get('edit/permissions/:id')
  @permission({
    permission_action: 'read',
    permission_resource: 'direct_grants',
  })
  @Render('partials/staff/permissions-dialog')
  async showPermissionsDialog(
    @Param('id') staffId: string,
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    await this.staffService.assertStaffManageable(staffId);
    // GET: load the available choices and the staff member's active selections.
    // The partial uses selected/selectedScope to reopen the saved state.
    const [roles, permissions] = await Promise.all([
      this.staffService.getRoleOptionsForStaff(staffId, scope),
      this.staffService.getPermissionOptionsForStaff(staffId, scope),
    ]);

    return {
      roles,
      ...permissions,
      staffId,
    };
  }

  @Post('edit/permissions/:id')
  @permission({
    permission_action: 'grant',
    permission_resource: 'direct_grants',
  })
  // The global ValidationPipe transforms and validates the submitted DTO
  // before this handler passes the target staff ID and acting user's ID onward.
  async editPermissions(
    @Param('id') staffId: string,
    @Body() editPermissionsDto: EditPermissionsDto,
    @CurrentUser() user: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.staffService.editPermissions(
      staffId,
      editPermissionsDto,
      user.id,
      scope,
    );

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
  @permission({ permission_action: 'edit', permission_resource: 'staff' })
  @Render('staff/staff-edit-profile-page')
  async showEditStaffForm(
    @Param('id') staffId: string,
    @CurrentUser() actor: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    const staff = await this.staffService.showStaffEditPage(
      staffId,
      actor.id,
      scope,
    );

    return {
      staff: {
        ...staff,
        isActor: staff.id === actor.id,
        initial: staff.fullName?.trim().charAt(0) ?? '',
        dateOfBirthValue: staff.dateOfBirth?.toISOString().slice(0, 10) ?? '',
        permissions: {
          canChangeStatus:
            scope === ScopeType.CENTER_WIDE && !staff.isSuperAdmin,
        },
      },
    };
  }

  @Post('edit/:id')
  @permission({ permission_action: 'edit', permission_resource: 'staff' })
  @UseFilters(EditStaffErrorFilter)
  async editStaff(
    @Param('id') id: string,
    @Body() editStaffDto: EditStaffDto,
    @Req() request: Request,
    @Res() response: Response,
    @CurrentUser() actor: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    await this.staffService.editStaff(id, editStaffDto, actor.id, scope);

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
  @permission({ permission_action: 'invite', permission_resource: 'staff' })
  @Render('staff/staff-invitation-dialog')
  showInviteForm() {
    return staffShell({
      title: 'دعوة موظف',
      form: {},
    });
  }
  @Post('invite')
  @permission({ permission_action: 'invite', permission_resource: 'staff' })
  @UseFilters(InviteStaffErrorFilter)
  async inviteStaff(
    @Body() inviteStaffDto: InviteStaffDto,
    @Req() request: Request,
    @Res() response: Response,
    @CurrentUser() actor: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    response.setHeader('Cache-Control', 'no-store');

    const result = await this.staffService.inviteStaff(
      inviteStaffDto,
      actor.id,
      scope,
    );

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

  @Post('generate-new-password/:id')
  @permission({ permission_action: 'edit', permission_resource: 'staff' })
  async generatePassword(
    @Param('id') id: string,
    @CurrentUser() actor: { id: string },
    @Req() request: Request,
    @Res() response: Response,
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const temporaryPassword = await this.staffService.generatePassword(
      id,
      actor.id,
      scope,
    );
    const staff = await this.staffService.showStaffProfile(actor.id, id, scope);
    const profile = {
      staff: {
        ...staff,
        initial: staff.fullName?.trim().charAt(0) ?? '',
        dateOfBirthLabel: formatStaffDate(staff.dateOfBirth),
        nationalIdLabel: staff.nationalId,
        phoneLabel: formatStaffPhone(staff.phone),
        statusLabel: formatStaffStatus(staff.status, staff.isDeleted),
        isActor: id === actor.id,
      },
      assignments: {
        classes: staff.classAssignments.map(({ halaqa }) => halaqa),
        activities: staff.activityAssignments.map(({ activity }) => activity),
        templates: staff.roleGrants.map(({ role }) => role),
        directGrantsLabel: 'تُتاح في إصدار لاحق',
      },
      permissions: {
        canChangeOwnPassword: actor.id === staff.id && !staff.isDeleted,
        canGeneratePassword:
          scope === ScopeType.CENTER_WIDE &&
          actor.id !== staff.id &&
          !staff.isDeleted,
        canEditStaff: !staff.isDeleted,
        canManagePermissions:
          scope === ScopeType.CENTER_WIDE &&
          !staff.isDeleted &&
          !staff.isSuperAdmin,
        canChangeStatus:
          scope === ScopeType.CENTER_WIDE &&
          !staff.isDeleted &&
          !staff.isSuperAdmin,
        canDelete:
          scope === ScopeType.CENTER_WIDE &&
          !staff.isDeleted &&
          !staff.isSuperAdmin,
      },
      effectivePermissionCount: 0,
      activeNav: 'staff',
    };

    response.render(
      'staff/admin-generates-password-page',
      staffShell({
        ...profile,
        title: 'إنشاء كلمة مرور',
        temporaryPassword,
        isHtmx: request.get('HX-Request') === 'true',
      }),
    );
  }

  @Get('reset-my-password')
  @permission({ permission_action: 'edit', permission_resource: 'staff' })
  async getChangePasswordPage(
    @CurrentUser() actor: { id: string },
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const staff = await this.staffService.getAccountSecurity(actor.id);
    return response.render(
      request.get('HX-Request') === 'true'
        ? 'partials/ui/otp-dialog'
        : 'staff/account-security-page',
      {
        ...accountSecurityView('password', staff.email),
        layout: request.get('HX-Request') === 'true' ? false : 'main',
      },
    );
  }

  @Get('change-email')
  @permission({ permission_action: 'edit', permission_resource: 'staff' })
  async getChangeEmailDialog(
    @CurrentUser() actor: { id: string },
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const staff = await this.staffService.getAccountSecurity(actor.id);
    return response.render(
      request.get('HX-Request') === 'true'
        ? 'partials/staff/change-email-dialog'
        : 'staff/account-security-page',
      {
        ...accountSecurityView('email', '', false),
        currentEmail: staff.email,
        layout: request.get('HX-Request') === 'true' ? false : 'main',
      },
    );
  }

  @Post('change-email/send-otp')
  @permission({ permission_action: 'edit', permission_resource: 'staff' })
  @UseFilters(AccountSecurityErrorFilter)
  async requestEmailChange(
    @CurrentUser() actor: { id: string },
    @Body() dto: RequestEmailChangeDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.staffService.sendChangeEmailOtp(
      actor.id,
      dto,
      request.session.sessionVersion!,
    );
    return response.render(
      request.get('HX-Request') === 'true'
        ? 'partials/ui/otp-dialog'
        : 'staff/account-security-page',
      {
        ...accountSecurityView('email', dto.email, true, true),
        layout: request.get('HX-Request') === 'true' ? false : 'main',
      },
    );
  }

  @Post('change-email/resend-otp')
  @permission({ permission_action: 'edit', permission_resource: 'staff' })
  @UseFilters(AccountSecurityErrorFilter)
  async resendEmailChange(
    @CurrentUser() actor: { id: string },
    @Body() dto: ForgotPasswordEmailDto,
    @Req() request: Request,
  ) {
    await this.staffService.resendChangeEmailOtp(
      actor.id,
      dto.email,
      request.session.sessionVersion!,
    );
    return { message: 'تم إرسال رمز التحقق إلى البريد الجديد' };
  }

  @Post('change-email')
  @permission({ permission_action: 'edit', permission_resource: 'staff' })
  @UseFilters(AccountSecurityErrorFilter)
  async changeEmail(
    @CurrentUser() actor: { id: string },
    @Body() dto: ConfirmEmailChangeDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const version = await this.staffService.changeEmail(
      actor.id,
      dto,
      request.session.sessionVersion!,
    );
    await this.renewAccountSession(request, actor.id, version);
    return this.accountChanged(
      request,
      response,
      `/staff/${encodeURIComponent(actor.id)}`,
    );
  }

  @Public()
  @Get('forgot-my-password')
  getForgotPasswordPage(@Res() response: Response) {
    return response.render('staff/forgot-my-password-page', {
      title: 'نسيت كلمة المرور',
      layout: 'auth',
    });
  }

  @Public()
  @Post(['forgot-my-password/send-otp', 'forgot-my-password/resend-otp'])
  @UseFilters(AccountSecurityErrorFilter)
  async sendForgotPasswordOtp(
    @Body() dto: ForgotPasswordEmailDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    try {
      await this.staffService.sendForgotPasswordOtp(dto.email);
    } catch (error: unknown) {
      // Keep the same response for unknown accounts and account-specific cooldowns.
      if (
        !(error instanceof HttpException) ||
        error.getStatus() !== Number(HttpStatus.TOO_MANY_REQUESTS)
      )
        throw error;
    }
    const notice =
      'إذا كان البريد مرتبطًا بحساب نشط، فسيصلك رمز تحقق. انتظر دقيقة قبل إعادة الإرسال.';
    if (
      request.path.endsWith('/resend-otp') &&
      request.get('HX-Request') === 'true'
    )
      return response.json({ message: notice });
    return response.render(
      request.get('HX-Request') === 'true'
        ? 'partials/ui/otp-dialog'
        : 'staff/forgot-my-password-page',
      {
        ...accountSecurityView('forgot-password', dto.email, true, true),
        notice,
        resetStep: true,
        layout: request.get('HX-Request') === 'true' ? false : 'auth',
      },
    );
  }

  @Public()
  @Post('forgot-my-password/reset')
  @UseFilters(AccountSecurityErrorFilter)
  async resetForgottenPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.staffService.resetForgottenPassword(dto);
    // Recovery never creates an authenticated session, including in a logged-in tab.
    await regenerateSession(request);
    await saveSession(request);
    return this.accountChanged(
      request,
      response,
      '/auth/signIn?passwordReset=1',
    );
  }

  @Get(':id')
  @permission({ permission_action: 'read', permission_resource: 'staff' })
  @Render('staff/staff-profile-page')
  async showStaffProfile(
    @Param('id') id: string,
    @CurrentUser() actor: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    const staff = await this.staffService.showStaffProfile(actor.id, id, scope);

    return {
      staff: {
        ...staff,
        initial: staff.fullName?.trim().charAt(0) ?? '',
        dateOfBirthLabel: formatStaffDate(staff.dateOfBirth),
        nationalIdLabel: staff.nationalId,
        phoneLabel: formatStaffPhone(staff.phone),
        statusLabel: formatStaffStatus(staff.status, staff.isDeleted),
        isActor: id === actor.id,
      },
      assignments: {
        classes: staff.classAssignments.map(({ halaqa }) => halaqa),
        activities: staff.activityAssignments.map(({ activity }) => activity),
        templates: staff.roleGrants.map(({ role }) => role),
        directGrantsLabel: 'تُتاح في إصدار لاحق',
      },
      permissions: {
        canChangeOwnPassword: actor.id === staff.id && !staff.isDeleted,
        canGeneratePassword:
          scope === ScopeType.CENTER_WIDE &&
          actor.id !== staff.id &&
          !staff.isDeleted,
        canEditStaff:
          !staff.isDeleted &&
          (scope === ScopeType.CENTER_WIDE || actor.id === staff.id),
        canManagePermissions:
          scope === ScopeType.CENTER_WIDE &&
          !staff.isDeleted &&
          !staff.isSuperAdmin,
        canChangeStatus:
          scope === ScopeType.CENTER_WIDE &&
          !staff.isDeleted &&
          !staff.isSuperAdmin,
        canDelete:
          scope === ScopeType.CENTER_WIDE &&
          !staff.isDeleted &&
          !staff.isSuperAdmin,
      },
      effectivePermissionCount: 0,
      activeNav: 'staff',
    };
  }

  @Get('deactivate/:id')
  @permission({ permission_action: 'deactivate', permission_resource: 'staff' })
  @Render('staff/staff-deactivate-page')
  async showDeactivateStaffDialog(
    @Param('id') staffId: string,
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    this.staffService.assertCenterWideScope(scope);
    await this.staffService.assertStaffManageable(staffId);
    return {
      staff: { id: staffId },
    };
  }
  @Post('deactivate/:id')
  @permission({ permission_action: 'deactivate', permission_resource: 'staff' })
  @Render('staff/staff-page')
  async deactivateStaff(
    @Param('id') staffId: string,
    @CurrentUser() actor: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.staffService.deactivateStaff(staffId, actor.id, scope);
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
  @permission({ permission_action: 'delete', permission_resource: 'staff' })
  @Render('staff/staff-delete-page')
  async showDeleteStaffDialog(
    @Param('id') staffId: string,
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    this.staffService.assertCenterWideScope(scope);
    await this.staffService.assertStaffManageable(staffId);
    return {
      staff: { id: staffId },
    };
  }
  @Post('delete/:id')
  @permission({ permission_action: 'delete', permission_resource: 'staff' })
  @Render('staff/staff-page')
  async deleteStaff(
    @Param('id') staffId: string,
    @CurrentUser() actor: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.staffService.deleteStaff(staffId, actor.id, scope);
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
  @permission({ permission_action: 'reactivate', permission_resource: 'staff' })
  @Render('staff/staff-activate-page')
  showactivateStaffDialog(
    @Param('id') staffId: string,
    @CurrentPermissionScope() scope: ScopeType,
  ) {
    this.staffService.assertCenterWideScope(scope);
    return {
      staff: { id: staffId },
    };
  }
  @Post('activate/:id')
  @permission({ permission_action: 'reactivate', permission_resource: 'staff' })
  @Render('staff/staff-page')
  async activateStaff(
    @Param('id') staffId: string,
    @CurrentUser() actor: { id: string },
    @CurrentPermissionScope() scope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.staffService.activateStaff(staffId, actor.id, scope);
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

  @Post('reset-my-password/send-otp')
  @permission({ permission_action: 'edit', permission_resource: 'staff' })
  @UseFilters(AccountSecurityErrorFilter)
  async sendChangePasswordOtp(
    @CurrentUser() actor: { id: string },
    @Req() request: Request,
  ) {
    await this.staffService.sendChangePasswordOtp(
      actor.id,
      request.session.sessionVersion!,
    );
    return { message: 'تم إرسال رمز التحقق' };
  }

  @Post('reset-my-password')
  @permission({ permission_action: 'edit', permission_resource: 'staff' })
  @UseFilters(AccountSecurityErrorFilter)
  async changeMyPassword(
    @Body() dto: ChangeMyPasswordDto,
    @CurrentUser() actor: { id: string },
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const version = await this.staffService.changeMyPassword(
      dto,
      actor.id,
      request.session.sessionVersion!,
    );
    await this.renewAccountSession(request, actor.id, version);
    return this.accountChanged(
      request,
      response,
      `/staff/${encodeURIComponent(actor.id)}`,
    );
  }

  private async renewAccountSession(
    request: Request,
    staffId: string,
    sessionVersion: number,
  ) {
    await regenerateSession(request);
    request.session.staffId = staffId;
    request.session.sessionVersion = sessionVersion;
    request.session.loggedInAt = Date.now();
    await saveSession(request);
  }

  private accountChanged(
    request: Request,
    response: Response,
    location: string,
  ) {
    if (request.get('HX-Request') === 'true')
      return response.setHeader('HX-Redirect', location).status(204).end();
    if (!wantsHtml(request)) return response.json({ success: true });
    return response.redirect(303, location);
  }
}
