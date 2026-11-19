import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  NotFoundException,
  Query,
  Render,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CreateTermDto } from './dto/create-term.dto';
import { ActorEndpointPermissionScope } from '../authorization/decorators/actor-endpoint-permission-scope.decorator';
import { TermsService } from './terms.service';
import { Permission } from '../authorization/decorators/permissions-access.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthorizationService } from '../authorization/authorization.service';
import { ScopeType } from '@prisma/client';
import { FilteredTermsDto } from './dto/filter-terms.dto';
import { termView } from './helpers/term-view';
import { CreateTermErrorFilter } from './filters/create-term-error.filter';

@Controller('terms')
export class TermsController {
  constructor(
    private readonly termsService: TermsService,
    private readonly authorizationSerivce: AuthorizationService,
  ) {}

  @Get()
  @Permission({ permission_resource: 'terms', permission_action: 'read' })
  async showTermList(
    @Query() filterDto: FilteredTermsDto,
    @CurrentUser() user: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    this.termsService.assertCenterWideScope(scope);
    const terms = await this.termsService.getTerms(filterDto);

    const data = {
      terms: terms.map(termView),
      filters: filterDto,
      title: 'الفصول والحلقات',
      activeNav: 'terms',
      sectionTitle: 'الفصول والحلقات',
      permissions: {
        canCreateTerm: await this.authorizationSerivce.hasPermission(
          user.id,
          'terms',
          'create',
          ScopeType.CENTER_WIDE,
        ),
      },
    };
    const restoringHistory =
      request.get('HX-History-Restore-Request') === 'true';
    const resultsOnly =
      request.get('HX-Request') === 'true' &&
      request.get('HX-Target') === 'terms-results' &&
      !restoringHistory;
    return response.render(
      resultsOnly ? 'partials/terms/term-results' : 'terms/terms-list',
      {
        ...data,
        layout: resultsOnly
          ? false
          : restoringHistory
            ? 'main'
            : request.get('HX-Request') === 'true'
              ? false
              : 'main',
      },
    );
  }

  @Get('create')
  @Permission({ permission_resource: 'terms', permission_action: 'create' })
  @Render('terms/create-term')
  async showCreateTermDialog(@ActorEndpointPermissionScope() scope: ScopeType) {
    this.termsService.assertCenterWideScope(scope);
    const newTermId = await this.termsService.getNextTermId();

    return {
      termId: newTermId,
      type: 'STANDARD',
      activeNav: 'terms',
      sectionTitle: 'إنشاء فصل',
    };
  }

  @Get(':id')
  @Permission({ permission_resource: 'terms', permission_action: 'read' })
  @Render('terms/term-detail')
  async showTerm(
    @Param(
      'id',
      new ParseUUIDPipe({
        exceptionFactory: () => new NotFoundException('الفصل غير موجود'),
      }),
    )
    id: string,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() scope: ScopeType,
  ) {
    const [canViewHalaqas, canCreateHalaqa] = await Promise.all([
      this.authorizationSerivce.hasPermission(
        actor.id,
        'halaqas',
        'read',
        ScopeType.CENTER_WIDE,
      ),
      this.authorizationSerivce.hasPermission(
        actor.id,
        'halaqas',
        'create',
        ScopeType.CENTER_WIDE,
      ),
    ]);
    const term = await this.termsService.getTerm(id, scope, canViewHalaqas);
    return {
      term: termView(term),
      title: `الفصل ${term.termId}`,
      permissions: { canViewHalaqas, canCreateHalaqa },
      activeNav: 'terms',
      sectionTitle: `الفصل ${term.termId}`,
    };
  }

  @Post('create')
  @Permission({ permission_resource: 'terms', permission_action: 'create' })
  @UseFilters(CreateTermErrorFilter)
  async newTerm(
    @Body() dto: CreateTermDto,
    @CurrentUser() actor: { id: string },
    @ActorEndpointPermissionScope() actorEndpointPermissionScope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const term = await this.termsService.createTerm(
      dto,
      actor.id,
      actorEndpointPermissionScope,
    );
    const canViewTerms = await this.authorizationSerivce.hasPermission(
      actor.id,
      'terms',
      'read',
      ScopeType.CENTER_WIDE,
    );
    if (!canViewTerms) {
      return response.render('terms/term-created', {
        termId: term.termId,
        activeNav: 'terms',
        sectionTitle: 'تم إنشاء الفصل',
      });
    }
    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/terms');
      response.status(204).send();
      return;
    }
    response.redirect(303, '/terms');
  }
}
