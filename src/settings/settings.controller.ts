import {
  Controller,
  Get,
  Render,
  Post,
  Body,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SettingsErrorFilter } from './settings-error.filter';
import { SettingsService } from './settings.service';
import { SettingsDto } from './dto/settings.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { permission } from '../authorization/decorators/permissions-access.decorator';
import { ActorEndpointPermissionScope } from '../authorization/decorators/actor-endpoint-permission-scope.decorator';
import { ScopeType } from '@prisma/client';
import { AuthorizationService } from '../authorization/authorization.service';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Get()
  @permission({ permission_action: 'read', permission_resource: 'settings' })
  @Render('settings/settings-page')
  async showSettingsPage(
    @ActorEndpointPermissionScope() actorEndpointPermissionScope: ScopeType,
    @CurrentUser() user: { id: string },
  ) {
    const settings = await this.settingsService.getSettings(
      actorEndpointPermissionScope,
    );

    return {
      settings,
      initialSettings: JSON.stringify(
        Object.fromEntries(
          Object.entries(settings).map(([key, setting]) => [
            key,
            setting.value,
          ]),
        ),
      ),
      permissions: {
        canSaveSettings: await this.authorizationService.hasPermission(
          user.id,
          'settings',
          'update',
          ScopeType.CENTER_WIDE,
        ),
      },
      activeNav: 'settings',
    };
  }

  @Post()
  @permission({ permission_action: 'update', permission_resource: 'settings' })
  @UseFilters(SettingsErrorFilter)
  async saveSettingsChanges(
    @Body() settingsDto: SettingsDto,
    @CurrentUser() user: { id: string },
    @ActorEndpointPermissionScope() actorEndpointPermissionScope: ScopeType,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const result = await this.settingsService.saveChanges(
      settingsDto,
      user.id,
      actorEndpointPermissionScope,
    );
    if (request.get('HX-Request') === 'true') {
      const settings = await this.settingsService.getSettings(
        actorEndpointPermissionScope,
      );
      response.setHeader('X-QCMS-Fragment', 'true');
      response.render('settings/settings-page', {
        layout: false,
        isHtmx: true,
        settings,
        initialSettings: JSON.stringify(
          Object.fromEntries(
            Object.entries(settings).map(([key, setting]) => [
              key,
              setting.value,
            ]),
          ),
        ),
        permissions: {
          canSaveSettings: await this.authorizationService.hasPermission(
            user.id,
            'settings',
            'update',
            ScopeType.CENTER_WIDE,
          ),
        },
        activeNav: 'settings',
        feedback: result.count ? 'تم حفظ التغييرات.' : 'لا توجد تغييرات للحفظ.',
      });
      return;
    }
    response.redirect(303, '/settings');
  }
}
