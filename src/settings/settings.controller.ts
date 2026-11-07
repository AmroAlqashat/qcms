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

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Render('settings/settings-page')
  async showSettingsPage() {
    const settings = await this.settingsService.getSettings();

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
      activeNav: 'settings',
    };
  }

  @Post()
  @UseFilters(SettingsErrorFilter)
  async saveSettingsChanges(
    @Body() settingsDto: SettingsDto,
    @CurrentUser() user: { id: string },
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const result = await this.settingsService.saveChanges(settingsDto, user.id);
    if (request.get('HX-Request') === 'true') {
      const settings = await this.settingsService.getSettings();
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
        activeNav: 'settings',
        feedback: result.count ? 'تم حفظ التغييرات.' : 'لا توجد تغييرات للحفظ.',
      });
      return;
    }
    response.redirect(303, '/settings');
  }
}
