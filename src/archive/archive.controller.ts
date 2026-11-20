import { Permission } from '../authorization/decorators/permissions-access.decorator';
import { ActorEndpointPermissionScope } from '../authorization/decorators/actor-endpoint-permission-scope.decorator';
import { ScopeType } from '@prisma/client';
import {
  Post,
  Body,
  ParseUUIDPipe,
  Redirect,
  ForbiddenException,
} from '@nestjs/common';
import { Controller, Get, Query, Render } from '@nestjs/common';
import { AuthenticatedOnly } from '../auth/decorators/route-access.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ArchiveService } from './archive.service';
@Controller('archive')
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}
  @Get()
  @AuthenticatedOnly()
  @Render('archive/list')
  async list(
    @CurrentUser() actor: { id: string },
    @Query('type') type: unknown,
    @Query('q') q: unknown,
    @Query('page') page: unknown,
  ) {
    const n = typeof page === 'string' ? Number(page) : 1;
    return {
      ...(await this.archive.list(
        actor.id,
        typeof type === 'string' ? type : '',
        typeof q === 'string' ? q.trim() : '',
        Number.isSafeInteger(n) && n > 0 && n < 1000000 ? n : 1,
      )),
      sectionTitle: 'الأرشيف',
      activeNav: 'archive',
    };
  }

  @Get('terms/new')
  @Permission({ permission_resource: 'terms', permission_action: 'delete' })
  @Render('archive/confirm')
  async selectterms(@ActorEndpointPermissionScope() scope: ScopeType) {
    this.requireCenter(scope);
    return {
      options: await this.archive.options('terms'),
      kind: 'terms',
      heading: 'أرشفة فصل',
    };
  }
  @Post('terms')
  @Permission({ permission_resource: 'terms', permission_action: 'delete' })
  @Redirect('/archive', 303)
  async archiveterms(
    @Body('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    this.requireCenter(scope);
    await this.archive.archive('terms', id, actor.id);
  }

  @Get('halaqas/new')
  @Permission({ permission_resource: 'halaqas', permission_action: 'delete' })
  @Render('archive/confirm')
  async selecthalaqas(@ActorEndpointPermissionScope() scope: ScopeType) {
    this.requireCenter(scope);
    return {
      options: await this.archive.options('halaqas'),
      kind: 'halaqas',
      heading: 'أرشفة حلقة',
    };
  }
  @Post('halaqas')
  @Permission({ permission_resource: 'halaqas', permission_action: 'delete' })
  @Redirect('/archive', 303)
  async archivehalaqas(
    @Body('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    this.requireCenter(scope);
    await this.archive.archive('halaqas', id, actor.id);
  }

  @Get('activities/new')
  @Permission({
    permission_resource: 'activities',
    permission_action: 'delete',
  })
  @Render('archive/confirm')
  async selectActivities(@ActorEndpointPermissionScope() scope: ScopeType) {
    this.requireCenter(scope);
    return {
      kind: 'activities',
      heading: 'أرشفة نشاط',
      options: await this.archive.options('activities'),
    };
  }

  @Post('activities')
  @Permission({
    permission_resource: 'activities',
    permission_action: 'delete',
  })
  @Redirect('/archive', 303)
  async archiveActivity(
    @Body('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    this.requireCenter(scope);
    await this.archive.archive('activities', id, actor.id);
  }
  private requireCenter(scope: ScopeType) {
    if (scope !== 'CENTER_WIDE')
      throw new ForbiddenException('تتطلب الأرشفة صلاحية على مستوى المركز');
  }
}
