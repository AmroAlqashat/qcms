import {
  Body,
  Controller,
  Get,
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
import { activityView } from './helpers/activity-view';

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
    @Body() createActivityDto: CreateActivityDto,
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.activitiesService.assertCenterWideScope(scope);

    await this.activitiesService.createActivity(createActivityDto);

    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/activities').status(204).send();
      return;
    }

    response.redirect(303, '/activities');
  }
}
