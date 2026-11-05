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
