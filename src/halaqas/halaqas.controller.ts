import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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

  private assertCenterWideScope(scope: ScopeType) {
    if (scope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException('يتطلب إنشاء حلقة صلاحية على مستوى المركز');
    }
  }
}
