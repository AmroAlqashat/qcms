import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../wants-html';

// Feature filters retain their form-specific recovery; this handles the rest.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const serverError = status >= 500;
    const message = serverError
      ? 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى لاحقًا.'
      : this.getMessage(body);

    if (serverError) {
      this.logger.error(
        'Request failed',
        exception instanceof Error ? exception.stack : 'Unknown exception',
      );
    }
    if (response.headersSent) return;
    response.set('Cache-Control', 'no-store');

    if (!wantsHtml(request)) {
      response
        .status(status)
        .json(
          !serverError && typeof body === 'object' && body !== null
            ? { ...body, statusCode: status }
            : { statusCode: status, message },
        );
      return;
    }

    // Keep the current form and its values, including on the sign-in page.
    if (request.get('HX-Request') === 'true') {
      response
        .status(status)
        .set({
          'X-QCMS-Toast': 'true',
          'HX-Retarget': '#toast-root',
          'HX-Reswap': 'beforeend',
        })
        .render('partials/ui/toast', { layout: false, message });
      return;
    }

    response.status(status).render('errors/error', {
      layout: false,
      title: 'تعذر إكمال الطلب',
      statusCode: status,
      message,
    });
  }

  private getMessage(body: unknown): string {
    if (typeof body === 'string') return body;
    if (typeof body === 'object' && body !== null) {
      const { errors, message } = body as {
        errors?: unknown;
        message?: unknown;
      };
      // Validation errors carry useful field messages alongside a generic title.
      if (typeof errors === 'object' && errors !== null) {
        const messages = Object.values(errors).filter(
          (value): value is string => typeof value === 'string',
        );
        if (messages.length) return messages.join('، ');
      }
      if (typeof message === 'string') return message;
      if (Array.isArray(message))
        return message
          .filter((value): value is string => typeof value === 'string')
          .join('، ');
    }
    return 'تعذر إكمال الطلب. يرجى التحقق من البيانات والمحاولة مرة أخرى.';
  }
}
