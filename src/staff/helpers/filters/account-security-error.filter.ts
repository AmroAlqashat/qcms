import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter';
import { wantsHtml } from '../../../common/wants-html';
import { accountSecurityView, SecurityFlow } from '../account-security-view';

@Catch(HttpException)
export class AccountSecurityErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const data =
      typeof payload === 'object'
        ? (payload as {
            errors?: Record<string, string>;
            message?: string;
            code?: string;
          })
        : { message: payload };
    if (
      status >= 500 ||
      status === 401 ||
      data.code === 'CSRF_INVALID' ||
      !wantsHtml(req)
    ) {
      return new HttpExceptionFilter().catch(exception, host);
    }
    res.setHeader('Cache-Control', 'no-store');
    const path = req.path.replace(/\/$/, '');
    const resend =
      path.endsWith('/resend-otp') ||
      path.endsWith('/reset-my-password/send-otp');
    if (resend && req.get('HX-Request') === 'true') {
      return res
        .status(status)
        .json({ message: data.message ?? exception.message });
    }
    const flow: SecurityFlow = path.includes('/change-email')
      ? 'email'
      : path.includes('/forgot-my-password')
        ? 'forgot-password'
        : 'password';
    const verification = !path.endsWith('/send-otp');
    const submitted = req.body as Record<string, unknown> | undefined;
    // Never reflect passwords or OTPs back into markup.
    const email = typeof submitted?.email === 'string' ? submitted.email : '';
    const values = {
      ...accountSecurityView(flow, email, verification),
      error: data.errors
        ? Object.values(data.errors).join('، ')
        : exception.message,
      errors: data.errors ?? {},
      form: { email },
    };
    const partial = verification
      ? 'partials/ui/otp-dialog'
      : flow === 'email'
        ? 'partials/staff/change-email-dialog'
        : 'staff/forgot-my-password-page';
    const isHtmx = req.get('HX-Request') === 'true';
    if (isHtmx)
      res.set({
        'X-QCMS-Fragment': 'true',
        'HX-Retarget':
          verification || flow === 'email' ? '#modal-root' : '#main-content',
        'HX-Reswap': 'innerHTML',
      });
    return res
      .status(status)
      .render(
        isHtmx
          ? partial
          : flow === 'forgot-password'
            ? 'staff/forgot-my-password-page'
            : 'staff/account-security-page',
        {
          ...values,
          layout: isHtmx ? false : flow === 'forgot-password' ? 'auth' : 'main',
          resetStep: verification,
        },
      );
  }
}
