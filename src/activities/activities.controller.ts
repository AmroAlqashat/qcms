import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Render,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ActivitiesService } from './activities.service';
import { Permission } from '../authorization/decorators/permissions-access.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ScopeType } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ActorEndpointPermissionScope } from '../authorization/decorators/actor-endpoint-permission-scope.decorator';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateActivityErrorFilter } from './filters/create-activity-error.filter';
import {
  ActivityAttendanceDto,
  RegisterActivityDto,
  RegisterGuestDto,
  ReturningGuestDto,
} from './dto/activity-roster.dto';
import { activityView, isActivityDay } from './helpers/activity-view';

@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @Permission({
    permission_resource: 'activities',
    permission_action: 'read',
  })
  @Render('activities/activities-list')
  async showActivitiesPage(
    @CurrentUser() user: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    const userScope =
      this.activitiesService.assertCenterWideOrAssignedClassScope(scope);
    const activities = await this.activitiesService.getActivities(
      user.id,
      userScope,
    );

    return {
      activities: activities.map(activityView),
      actorScope: userScope,
      title: 'الأنشطة',
      activeNav: 'activities',
      sectionTitle: 'الأنشطة',
      permissions: {
        canCreateActivity: await this.authorizationService.hasPermission(
          user.id,
          'activities',
          'create',
          ScopeType.CENTER_WIDE,
        ),
      },
    };
  }

  @Get('new')
  @Permission({
    permission_resource: 'activities',
    permission_action: 'create',
  })
  @Render('activities/create-activity')
  async showNewActivityDialog(
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    this.activitiesService.assertCenterWideScope(scope);

    return {
      activeNav: 'activities',
      sectionTitle: 'إنشاء نشاط',
      level: 'CENTER_WIDE',
      formAction: '/activities',
      halaqas: await this.activitiesService.getActiveHalaqas(),
    };
  }

  @Post()
  @Permission({
    permission_resource: 'activities',
    permission_action: 'create',
  })
  @UseFilters(CreateActivityErrorFilter)
  async createActivity(
    @CurrentUser() actor: { id: string },
    @Body() createActivityDto: CreateActivityDto,
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.activitiesService.assertCenterWideScope(scope);

    await this.activitiesService.saveActivity(createActivityDto, actor.id);

    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/activities').status(204).send();
      return;
    }

    response.redirect(303, '/activities');
  }

  @Get(':id')
  @Permission({ permission_resource: 'activities', permission_action: 'read' })
  @Render('activities/detail')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    const activity = await this.activitiesService.getActivityData(
      actor.id,
      id,
      scope,
    );
    const archived = !!(
      activity.archivedAt ||
      activity.halaqa?.archivedAt ||
      activity.halaqa?.term.archivedAt
    );
    const permits = async (action: string) =>
      (await this.authorizationService.hasPermission(
        actor.id,
        'activity_participants',
        action,
        ScopeType.CENTER_WIDE,
      )) ||
      (!!activity.halaqaId &&
        (await this.authorizationService.hasPermission(
          actor.id,
          'activity_participants',
          action,
          ScopeType.ASSIGNED_CLASS,
        )) &&
        (await this.activitiesService.isAssigned(actor.id, activity.halaqaId)));
    return {
      canRegister: !archived && (await permits('create')),
      canAttend:
        !archived && isActivityDay(activity.date) && (await permits('update')),
      canViewParticipants: await permits('read'),
      activity: activityView(activity),
      archived,
      activeNav: archived ? 'archive' : 'activities',
      sectionTitle: activity.name,
      canEdit:
        !archived &&
        (await this.authorizationService.hasPermission(
          actor.id,
          'activities',
          'update',
          ScopeType.CENTER_WIDE,
        )),
    };
  }
  @Get(':id/edit')
  @Permission({
    permission_resource: 'activities',
    permission_action: 'update',
  })
  @Render('activities/create-activity')
  async edit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    this.activitiesService.assertCenterWideScope(scope);
    const a = await this.activitiesService.getActivityData(actor.id, id, scope);
    if (a.archivedAt || a.halaqa?.archivedAt || a.halaqa?.term.archivedAt)
      throw new NotFoundException('النشاط مؤرشف');
    const local = (d: Date) =>
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Amman',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .format(d)
        .replace(' ', 'T');
    const [date, time] = local(a.date).split('T');
    return {
      ...a,
      formAction: '/activities/' + id + '/edit',
      date,
      time,
      template: String(a.form?.template ?? ''),
      closeDate: a.form?.closesAt ? local(a.form.closesAt) : '',
      halaqas: await this.activitiesService.getActiveHalaqas(),
      sectionTitle: 'تعديل النشاط',
    };
  }
  @Post(':id/edit')
  @UseFilters(CreateActivityErrorFilter)
  @Permission({
    permission_resource: 'activities',
    permission_action: 'update',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Body() dto: CreateActivityDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.activitiesService.assertCenterWideScope(scope);
    await this.activitiesService.saveActivity(dto, actor.id, id);
    const url = '/activities/' + id;
    if (req.get('HX-Request') === 'true')
      return res.set('HX-Redirect', url).status(204).send();
    return res.redirect(303, url);
  }
  @Get('register/:id')
  @Permission({
    permission_resource: 'activity_participants',
    permission_action: 'create',
  })
  @Render('activities/register')
  async registerDialog(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    return {
      activityId: id,
      guests: await this.activitiesService.previousGuests(actor.id, id, scope),
      students: await this.activitiesService.eligibleStudents(
        actor.id,
        id,
        scope,
      ),
    };
  }
  @Post('register/:id')
  @Permission({
    permission_resource: 'activity_participants',
    permission_action: 'create',
  })
  async register(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Body() dto: RegisterActivityDto,
    @Res() res: Response,
  ) {
    await this.activitiesService.register(id, actor.id, scope, dto);
    res.redirect(303, '/activities/' + id);
  }
  @Post('register/:id/guest')
  @Permission({
    permission_resource: 'activity_participants',
    permission_action: 'create',
  })
  async registerGuest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Body() dto: RegisterGuestDto,
    @Res() res: Response,
  ) {
    await this.activitiesService.registerGuest(id, actor.id, scope, dto);
    res.redirect(303, '/activities/' + id);
  }
  @Post('register/:id/guest/existing')
  @Permission({
    permission_resource: 'activity_participants',
    permission_action: 'create',
  })
  async registerReturningGuest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Body() dto: ReturningGuestDto,
    @Res() res: Response,
  ) {
    await this.activitiesService.registerGuest(id, actor.id, scope, dto);
    res.redirect(303, '/activities/' + id);
  }
  @Post(':id/attendance')
  @Permission({
    permission_resource: 'activity_participants',
    permission_action: 'update',
  })
  async attendance(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Body() dto: ActivityAttendanceDto,
    @Res() res: Response,
  ) {
    await this.activitiesService.attendance(id, actor.id, scope, dto);
    res.redirect(303, '/activities/' + id);
  }
}
