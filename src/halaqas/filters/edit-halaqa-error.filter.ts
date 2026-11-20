import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../../common/wants-html';
import { HalaqasService } from '../halaqas.service';
import { HALAQA_WEEK_DAYS } from '../halaqa-week-days';

@Catch(UnprocessableEntityException)
export class EditHalaqaErrorFilter implements ExceptionFilter {
  constructor(private readonly halaqasService: HalaqasService) {}

  async catch(exception: UnprocessableEntityException, host: ArgumentsHost) {
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
    const id = request.params.id;
    const termId = typeof body.termId === 'string' ? body.termId : '';
    const name = typeof body.name === 'string' ? body.name : '';

    response.status(exception.getStatus()).render('halaqas/edit', {
      halaqa: {
        id,
        name,
        term: { termId },
        meetingDays: HALAQA_WEEK_DAYS.map((label, index) => ({
          label,
          startTime: this.valueAt(meetingDays.startTime, index),
          endTime: this.valueAt(meetingDays.endTime, index),
        })),
      },
      terms: await this.halaqasService.getActiveTerms(),
      errors,
      error: 'لم تُحفظ التغييرات. راجع البيانات المدخلة وحاول مرة أخرى.',
      title: 'تعديل الحلقة',
      activeNav: 'terms',
      sectionTitle: 'تعديل الحلقة',
    });
  }

  private valueAt(value: unknown, index: number): string {
    if (Array.isArray(value) && typeof value[index] === 'string') {
      return value[index];
    }
    return typeof value === 'string' && index === 0 ? value : '';
  }
}
