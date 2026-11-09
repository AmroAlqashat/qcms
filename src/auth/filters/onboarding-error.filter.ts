import type { Response } from 'express';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { AuthService } from '../auth.service';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Request } from 'express';
import { renderAuthError } from './auth-form-error';

@Catch(HttpException)
export class OnboardingErrorFilter implements ExceptionFilter {
  constructor(private readonly auth: AuthService) {}

  async catch(exception: HttpException, host: ArgumentsHost): Promise<void> {
    const request = host.switchToHttp().getRequest<Request>();
    const path = request.path.replace(/\/$/, '').toLowerCase();
    const profile = path.endsWith('/complete-profile');
    const password = path.endsWith('/change-password');
    if (
      !profile &&
      !password &&
      !path.endsWith('/send-otp') &&
      request.get('HX-Request') === 'true'
    ) {
      const body = exception.getResponse();
      const payload =
        typeof body === 'object'
          ? (body as { errors?: Record<string, string>; code?: string })
          : {};
      if (
        exception.getStatus() >= 500 ||
        exception.getStatus() === 401 ||
        payload.code === 'CSRF_INVALID'
      )
        return new HttpExceptionFilter().catch(exception, host);
      const response = host.switchToHttp().getResponse<Response>();
      response
        .status(exception.getStatus())
        .set({
          'Cache-Control': 'no-store',
          'X-QCMS-Fragment': 'true',
          'HX-Retarget': '#modal-root',
          'HX-Reswap': 'innerHTML',
        })
        .render('partials/ui/otp-dialog', {
          layout: false,
          dialogId: 'onboarding-otp-dialog',
          heading: 'تأكيد البريد الإلكتروني',
          action: '/auth/onboarding/verify-otp',
          resendAction: '/auth/onboarding/send-otp',
          submitLabel: 'تأكيد الرمز والمتابعة',
          errors: payload.errors ?? {},
          error: exception.message,
        });
      return;
    }
    let jobTitleLabel: string | undefined;
    if (
      profile &&
      exception.getStatus() !== 401 &&
      request.session.onboardingStep
    ) {
      const saved = await this.auth.getOnboardingProfile(
        request.session.onboardingStep.staffId,
      );
      jobTitleLabel = saved.jobTitleLabel;
    }
    renderAuthError(
      exception,
      host,
      profile
        ? 'auth/onboarding-profile-page'
        : password
          ? 'auth/onboarding-password-page'
          : 'auth/onboarding-otp-page',
      profile ? ['fullName', 'dateOfBirth', 'nationalId', 'phone'] : [],
      path.endsWith('/send-otp'),
      { jobTitleLabel },
    );
  }
}
