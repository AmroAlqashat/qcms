import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../../common/wants-html';

@Catch(ConflictException, UnprocessableEntityException)
export class CreateTermErrorFilter implements ExceptionFilter {
  catch(
    exception: ConflictException | UnprocessableEntityException,
    host: ArgumentsHost,
  ) {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    if (!wantsHtml(request)) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    const body = request.body as Record<string, unknown>;
    const value = (key: string) =>
      typeof body[key] === 'string' ? body[key] : '';
    const details = exception.getResponse();
    const errors =
      typeof details === 'object'
        ? (details as { errors?: Record<string, string> }).errors
        : undefined;
    const isHtmx = request.get('HX-Request') === 'true';
    if (isHtmx)
      response.set({
        'X-QCMS-Fragment': 'true',
        'HX-Retarget': '#modal-root',
        'HX-Reswap': 'innerHTML',
      });
    response.status(exception.getStatus()).render('terms/create-term', {
      layout: isHtmx ? false : 'main',
      isHtmx,
      activeNav: 'terms',
      sectionTitle: 'إنشاء فصل',
      termId: value('termId'),
      type: value('type'),
      startDate: value('startDate'),
      endDate: value('endDate'),
      errors,
      error: errors
        ? 'لم يُحفظ الفصل. راجع الحقول الموضّحة أدناه.'
        : exception.message,
    });
  }
}
