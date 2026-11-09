import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../wants-html';

@Catch(NotFoundException)
export class NotFoundFilter implements ExceptionFilter {
  catch(_exception: NotFoundException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    if (request.get('HX-Request') === 'true') {
      response
        .status(404)
        .set({
          'X-QCMS-Toast': 'true',
          'HX-Retarget': '#toast-root',
          'HX-Reswap': 'beforeend',
        })
        .render('partials/ui/toast', {
          layout: false,
          message: 'تعذر العثور على الصفحة أو المورد المطلوب',
        });
      return;
    }

    if (wantsHtml(request)) {
      response.status(404).render('errors/404', {
        layout: false,
        title: 'الصفحة غير موجودة',
        sectionTitle: 'الصفحة غير موجودة',
      });
      return;
    }

    response.status(404).json({
      statusCode: 404,
      message: 'Resource not found',
    });
  }
}
