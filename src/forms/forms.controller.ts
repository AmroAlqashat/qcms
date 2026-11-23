import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Render,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FormsService } from './forms.service';
import { Permission } from '../authorization/decorators/permissions-access.decorator';
import { CreateFormDto } from './dto/create-form.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ActorEndpointPermissionScope } from '../authorization/decorators/actor-endpoint-permission-scope.decorator';
import { ScopeType } from '@prisma/client';
import { AuthorizationService } from '../authorization/authorization.service';
import { EditFormDto } from './dto/edit-form.dto';

@Controller('forms')
export class FormsController {
  constructor(
    private readonly formsService: FormsService,
    private readonly authorizationSerivce: AuthorizationService,
  ) {}

  // Master-detail: the list of names, and the selected form shown beside it.
  // GET /forms selects the first form; GET /forms/:id (below) selects one.
  @Get()
  @Permission({
    permission_resource: 'forms',
    permission_action: 'read',
  })
  @Render('forms/forms-list')
  async showMainFormPage(
    @ActorEndpointPermissionScope() scope: ScopeType,
    @CurrentUser() user: { id: string },
  ) {
    this.formsService.assertCenterWideScope(scope);
    return this.formsService.formsListView(user.id, scope);
  }

  // Create and edit share one builder view; `action` tells its JS where to save.
  @Get('create')
  @Permission({
    permission_resource: 'forms',
    permission_action: 'create',
  })
  @Render('forms/form-builder')
  showCreateFormPage(@ActorEndpointPermissionScope() scope: ScopeType) {
    this.formsService.assertCenterWideScope(scope);

    return {
      name: '',
      form: { display: 'form', components: [] },
      action: '/forms/create',
      title: 'إنشاء نموذج',
      activeNav: 'forms',
      sectionTitle: 'إنشاء نموذج',
    };
  }

  @Get('edit/:id')
  @Permission({
    permission_resource: 'forms',
    permission_action: 'update',
  })
  @Render('forms/form-builder')
  async showEditFormPage(
    @Param('id') formId: string,
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    this.formsService.assertCenterWideScope(scope);
    const form = await this.formsService.getForm(formId);

    return {
      name: form.name,
      form: form.form,
      action: `/forms/edit/${form.id}`,
      isLocked: await this.formsService.isActivityFormLocked(formId),
      title: 'تعديل نموذج',
      activeNav: 'forms',
      sectionTitle: 'تعديل نموذج',
    };
  }

  @Post('create')
  @Permission({
    permission_resource: 'forms',
    permission_action: 'create',
  })
  async createForm(
    @Body() createFormDto: CreateFormDto,
    @CurrentUser() user: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Res() response: Response,
  ) {
    this.formsService.assertCenterWideScope(scope);
    const newForm = await this.formsService.createForm(user.id, createFormDto);

    // The builder page has its own URL, so the user may not be allowed to
    // see the list; send them to a fresh builder instead of a 403.
    const canViewForms = await this.authorizationSerivce.hasPermission(
      user.id,
      'forms',
      'read',
      ScopeType.CENTER_WIDE,
    );
    const location = canViewForms ? '/forms' : '/forms/create';
    response.status(201).json({ id: newForm.id, location });
  }

  @Post('edit/:id')
  @Permission({
    permission_resource: 'forms',
    permission_action: 'update',
  })
  async editForm(
    @Param('id') formId: string,
    @CurrentUser() user: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Res() response: Response,
    @Body() editFormDto: EditFormDto,
  ) {
    this.formsService.assertCenterWideScope(scope);

    await this.formsService.editForm(user.id, formId, editFormDto);

    // Without forms:read, stay on the same form instead of a 403.
    const canViewForms = await this.authorizationSerivce.hasPermission(
      user.id,
      'forms',
      'read',
      ScopeType.CENTER_WIDE,
    );
    const location = canViewForms ? '/forms' : `/forms/edit/${formId}`;
    response.status(200).json({ id: formId, location });
  }

  @Post('delete/:id')
  @Permission({
    permission_resource: 'forms',
    permission_action: 'delete',
  })
  async deleteForm(
    @Param('id') formId: string,
    @CurrentUser() user: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.formsService.assertCenterWideScope(scope);

    await this.formsService.deleteForm(user.id, formId);

    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/forms');
      response.status(204).send();
      return;
    }
    response.redirect(303, '/forms');
  }

  @Get('delete/:id')
  @Permission({
    permission_resource: 'forms',
    permission_action: 'delete',
  })
  @Render('forms/form-delete-dialog')
  async showDeleteFormDialog(
    @Param('id') formId: string,
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    this.formsService.assertCenterWideScope(scope);
    const form = await this.formsService.getForm(formId);

    return {
      form: {
        id: form.id,
        name: form.name,
        activitiesCount: form._count.activities,
      },
      title: 'حذف نموذج',
      activeNav: 'forms',
      sectionTitle: 'حذف نموذج',
    };
  }

  // Declared last so 'create', 'edit/:id' and 'delete/:id' match first.
  @Get(':id')
  @Permission({
    permission_resource: 'forms',
    permission_action: 'read',
  })
  @Render('forms/forms-list')
  async showForm(
    @Param('id') formId: string,
    @ActorEndpointPermissionScope() scope: ScopeType,
    @CurrentUser() user: { id: string },
  ) {
    this.formsService.assertCenterWideScope(scope);
    return this.formsService.formsListView(user.id, scope, formId);
  }
}
