import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../../common/wants-html';
import { ActivitiesService } from '../activities.service';

@Catch(UnprocessableEntityException)
export class CreateActivityErrorFilter implements ExceptionFilter {
  constructor(private readonly activitiesService: ActivitiesService) {}

  async catch(exception: HttpException, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    if (!wantsHtml(request)) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const body = request.body as Record<string, unknown>;
    const details = exception.getResponse();
    const errors =
      typeof details === 'object' && details !== null
        ? (details as { errors?: Record<string, string> }).errors
        : undefined;
    const activityId = this.stringValue(request.params.id);
    const isHtmx = request.get('HX-Request') === 'true';

    if (isHtmx) {
      response.set({
        'X-QCMS-Fragment': 'true',
        'HX-Retarget': '#modal-root',
        'HX-Reswap': 'innerHTML',
      });
    }

    response
      .status(exception.getStatus())
      .render(
        isHtmx
          ? 'partials/activities/create-activity-dialog'
          : 'activities/create-activity',
        {
          layout: isHtmx ? false : 'main',
          isHtmx,
          formAction: activityId
            ? `/activities/${activityId}/edit`
            : '/activities',
          activeNav: 'activities',
          sectionTitle: activityId ? 'تعديل النشاط' : 'إنشاء نشاط',
          name: this.stringValue(body.name),
          level: this.stringValue(body.level) || 'CENTER_WIDE',
          halaqaId: this.stringValue(body.halaqaId),
          time: this.stringValue(body.time),
          forms: await this.activitiesService.getFormOptions(),
          formId: this.stringValue(body.formId),
          isFormEnabled: body.isFormEnabled === 'true',
          closeDate: this.stringValue(body.closeDate),
          date: this.stringValue(body.date),
          location: this.stringValue(body.location),
          halaqas: await this.activitiesService.getActiveHalaqas(),
          errors,
          error:
            errors || exception.getStatus() === 422
              ? 'لم يُحفظ النشاط. راجع الحقول الموضّحة أدناه.'
              : exception.message,
        },
      );
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
