import { ArgumentsHost, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../../common/wants-html';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';

export function renderAuthError(
  exception: HttpException,
  host: ArgumentsHost,
  view: string,
  fields: string[],
  resend = false,
): void {
  const request = host.switchToHttp().getRequest<Request>();
  const response = host.switchToHttp().getResponse<Response>();
  if (response.headersSent) return;
  const status = exception.getStatus();
  const body = exception.getResponse();
  const isHtmx = request.get('HX-Request') === 'true';
  response.setHeader('Cache-Control', 'no-store');

  // The resend button consumes JSON without swapping the verification form.
  if (resend && isHtmx) {
    response.status(status).json(
      status >= 500
        ? {
            statusCode: status,
            message: 'تعذر إرسال الرمز. يرجى المحاولة لاحقًا.',
          }
        : typeof body === 'string'
          ? { statusCode: status, message: body }
          : body,
    );
    return;
  }
  if (status >= 500 || !wantsHtml(request)) {
    new HttpExceptionFilter().catch(exception, host);
    return;
  }

  const payload =
    typeof body === 'object'
      ? (body as { message?: unknown; errors?: unknown })
      : { message: body };
  const errors =
    payload.errors && typeof payload.errors === 'object'
      ? Object.fromEntries(
          Object.entries(payload.errors).filter(
            ([, value]) => typeof value === 'string',
          ),
        )
      : {};
  const error = Object.keys(errors).length
    ? 'يرجى تصحيح الأخطاء الموضحة أدناه.'
    : Array.isArray(payload.message)
      ? payload.message
          .filter((value): value is string => typeof value === 'string')
          .join('، ')
      : typeof payload.message === 'string'
        ? payload.message
        : 'تعذر إكمال الطلب.';
  // Explicit allowlist: never render passwords, OTPs, or arbitrary request fields.
  const submitted = request.body as Record<string, unknown> | undefined;
  const form = Object.fromEntries(
    fields.map((field) => [
      field,
      typeof submitted?.[field] === 'string' ? submitted[field] : '',
    ]),
  );
  if (isHtmx) {
    response.set({
      'X-QCMS-Fragment': 'true',
      'HX-Retarget': '#main-content',
      'HX-Reswap': 'innerHTML',
    });
  }
  response.status(status).render(view, {
    layout: isHtmx ? false : 'auth',
    title: 'تسجيل الدخول واستكمال الحساب',
    form,
    errors,
    error: errors.profile ? String(errors.profile) : error,
  });
}
