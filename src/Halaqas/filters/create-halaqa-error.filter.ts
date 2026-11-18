import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../../common/wants-html';
import { HALAQA_WEEK_DAYS } from '../halaqa-week-days';

@Catch(HttpException)
export class CreateHalaqaErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    if (!wantsHtml(request)) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const body = request.body as Record<string, unknown>;
    const meetingDays =
      typeof body.meetingDays === 'object' && body.meetingDays !== null
        ? (body.meetingDays as Record<string, unknown>)
        : {};
    const details = exception.getResponse();
    const errors =
      typeof details === 'object' && details !== null
        ? (details as { errors?: Record<string, string> }).errors
        : undefined;
    const isHtmx = request.get('HX-Request') === 'true';
    const values = {
      termId: typeof body.termId === 'string' ? body.termId : '',
      name: typeof body.name === 'string' ? body.name : '',
      days: HALAQA_WEEK_DAYS.map((label, index) => ({
        label,
        startTime: this.valueAt(meetingDays.startTime, index),
        endTime: this.valueAt(meetingDays.endTime, index),
      })),
    };
    if (isHtmx) {
      response.set({
        'X-QCMS-Fragment': 'true',
        'HX-Retarget': '#modal-root',
        'HX-Reswap': 'innerHTML',
      });
    }
    response
      .status(exception.getStatus())
      .render('partials/halaqas/create-halaqa-dialog', {
        ...values,
        errors,
        error:
          errors || exception.getStatus() === 422
            ? 'لم تُحفظ الحلقة. راجع البيانات المدخلة وحاول مرة أخرى.'
            : exception.message,
        layout: false,
      });
  }

  private valueAt(value: unknown, index: number): string {
    if (Array.isArray(value) && typeof value[index] === 'string') {
      return value[index];
    }
    return typeof value === 'string' && index === 0 ? value : '';
  }
}
