import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../common/wants-html';
import { SettingsService } from './settings.service';

@Catch(UnprocessableEntityException)
export class SettingsErrorFilter implements ExceptionFilter {
  constructor(private readonly settingsService: SettingsService) {}

  async catch(exception: UnprocessableEntityException, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    if (!wantsHtml(request)) {
      response.status(422).json(exception.getResponse());
      return;
    }

    const stored = await this.settingsService.getSettings();
    const initialSettings = JSON.stringify(
      Object.fromEntries(
        Object.entries(stored).map(([key, setting]) => [key, setting.value]),
      ),
    );
    const settings: Record<string, { value: unknown }> = { ...stored };
    const body = request.body as Record<string, unknown>;
    for (const key of [
      'centerName',
      'currency',
      'registrationOpen',
      'sessionInactivityTimeoutMinutes',
      'delegateAccessExpiryHours',
    ]) {
      const value = body[key];
      settings[key] = {
        value: ['string', 'number', 'boolean'].includes(typeof value)
          ? value
          : '',
      };
    }
    const details = exception.getResponse();
    const errors =
      typeof details === 'object'
        ? (details as { errors?: Record<string, string> }).errors
        : undefined;
    const isHtmx = request.get('HX-Request') === 'true';
    if (isHtmx) {
      response.setHeader('X-QCMS-Fragment', 'true');
      response.setHeader('HX-Retarget', '#settings-page');
      response.setHeader('HX-Reswap', 'outerHTML');
    }
    response.status(422).render('settings/settings-page', {
      layout: isHtmx ? false : 'main',
      isHtmx,
      activeNav: 'settings',
      settings,
      initialSettings,
      errors,
      error: 'لم تُحفظ التغييرات. راجع الحقول الموضّحة أدناه.',
    });
  }
}
