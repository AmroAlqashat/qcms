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
  catch(exception: HttpException, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<Request>();
    const path = request.path.replace(/\/$/, '').toLowerCase();
    const profile = path.endsWith('/complete-profile');
    const password = path.endsWith('/change-password');
    renderAuthError(
      exception,
      host,
      profile
        ? 'auth/onboarding-profile-page'
        : password
          ? 'auth/onboarding-password-page'
          : 'auth/onboarding-otp-page',
      profile
        ? ['fullName', 'jobTitle', 'dateOfBirth', 'nationalId', 'phone']
        : [],
      path.endsWith('/send-otp'),
    );
  }
}
