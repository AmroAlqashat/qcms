import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { setSetupHeaders } from '../setup-http';

@Catch(ConflictException, ForbiddenException, UnprocessableEntityException)
export class SetupErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    setSetupHeaders(res);
    const body = exception.getResponse();
    const payload =
      typeof body === 'object'
        ? (body as { code?: string; errors?: Record<string, string> })
        : {};
    const submitted = req.body as Record<string, unknown> | undefined;
    // Only these non-secret values may be reflected into the form.
    const form = Object.fromEntries(
      ['fullName', 'email'].map((field) => [
        field,
        typeof submitted?.[field] === 'string' ? submitted[field] : '',
      ]),
    );
    return res.status(exception.getStatus()).render('auth/setup-page', {
      layout: 'auth',
      title: 'إعداد المركز',
      available: payload.code !== 'CSRF_INVALID',
      csrfInvalid: payload.code === 'CSRF_INVALID',
      form,
      errors: payload.errors ?? {},
      error:
        exception.getStatus() === 422
          ? 'يرجى تصحيح البيانات وإعادة إدخال الرمز وكلمة المرور.'
          : exception.message,
    });
  }
}
