import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Render,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ScopeType } from '@prisma/client';
import { Permission } from '../authorization/decorators/permissions-access.decorator';
import { ActorEndpointPermissionScope } from '../authorization/decorators/actor-endpoint-permission-scope.decorator';
import { createHalaqaDto } from './dto/create-halaqa.dto';
import { HalaqasService } from './halaqas.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateHalaqaErrorFilter } from './filters/create-halaqa-error.filter';
import { HALAQA_WEEK_DAYS } from './halaqa-week-days';
import { Prisma } from '@prisma/client';

@Controller('halaqas')
export class HalaqasController {
  constructor(private readonly halaqasService: HalaqasService) {}

  @Get('new')
  @Permission({ permission_resource: 'halaqas', permission_action: 'create' })
  @Render('halaqas/create-halaqa')
  async showCreateHalaqaForm(
    @Query('termId') termId: string,
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    this.assertCenterWideScope(scope);
    const term = await this.halaqasService.getActiveTerm(termId);
    return {
      termId: term.termId,
      days: HALAQA_WEEK_DAYS.map((label) => ({
        label,
        startTime: '',
        endTime: '',
      })),
    };
  }

  @Post('new')
  @Permission({ permission_resource: 'halaqas', permission_action: 'create' })
  @UseFilters(CreateHalaqaErrorFilter)
  async createNewHalaqa(
    @Body() dto: createHalaqaDto,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.assertCenterWideScope(scope);
    const halaqa = await this.halaqasService.createHalaqa(dto, actor.id);
    const location = `/terms/${halaqa.termId}`;
    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', location).status(204).send();
      return;
    }
    response.redirect(303, location);
  }

  @Get(':id')
  @Permission({ permission_resource: 'halaqas', permission_action: 'read' })
  @Render('halaqas/detail')
  async showHalaqa(
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException('الحلقة غير موجودة'),
      }),
    )
    id: string,
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    const halaqa = await this.halaqasService.getHalaqa(id, scope);
    return {
      halaqa: {
        ...halaqa,
        meetingDays: this.meetingDaysView(halaqa.meetingDays),
      },
      title: halaqa.name,
      activeNav: 'terms',
      sectionTitle: halaqa.name,
    };
  }

  private assertCenterWideScope(scope: ScopeType) {
    if (scope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException('يتطلب إنشاء حلقة صلاحية على مستوى المركز');
    }
  }

  private meetingDaysView(value: Prisma.JsonValue) {
    const startTimes =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value.startTime
        : undefined;
    const endTimes =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value.endTime
        : undefined;
    if (
      !this.isStringArray(startTimes) ||
      !this.isStringArray(endTimes) ||
      startTimes.length !== HALAQA_WEEK_DAYS.length ||
      endTimes.length !== HALAQA_WEEK_DAYS.length
    ) {
      throw new InternalServerErrorException('مواعيد الحلقة المخزنة غير صالحة');
    }

    return HALAQA_WEEK_DAYS.flatMap((label, index) => {
      const startTime = startTimes[index];
      const endTime = endTimes[index];
      return startTime && endTime ? [{ label, startTime, endTime }] : [];
    });
  }

  private isStringArray(value: Prisma.JsonValue | undefined): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
  }
}
