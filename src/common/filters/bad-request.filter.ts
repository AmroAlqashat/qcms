import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../wants-html';

@Catch(BadRequestException)
export class BadRequestFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status = exception.getStatus();
    const message = this.getMessage(exception);

    if (!wantsHtml(request)) {
      response.status(status).json({
        statusCode: status,
        message,
      });
      return;
    }

    if (request.get('HX-Request') === 'true') {
      response
        .status(status)
        .set({
          'X-QCMS-Toast': 'true',
          'HX-Retarget': '#toast-root',
          'HX-Reswap': 'beforeend',
        })
        .render('partials/ui/toast', { message });
      return;
    }

    response.status(status).render('errors/400', {
      title: 'طلب غير صالح',
      sectionTitle: 'طلب غير صالح',
      message,
    });
  }

  private getMessage(exception: BadRequestException): string {
    const body = exception.getResponse();

    if (typeof body === 'string') {
      return body;
    }

    if (typeof body === 'object' && body !== null) {
      const message = (body as { message?: string | string[] }).message;

      if (Array.isArray(message)) {
        return message.join('، ');
      }

      if (typeof message === 'string') {
        return message;
      }
    }

    return exception.message;
  }
}
