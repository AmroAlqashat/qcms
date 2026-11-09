import 'express-session';

type OnboardingStep = 'VERIFY_OTP' | 'COMPLETE_PROFILE' | 'CHANGE_PASSWORD';

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    staffId?: string;
    sessionVersion?: number;
    loggedInAt?: number;

    onboardingStep?: {
      staffId: string;
      sessionVersion: number;
      step: OnboardingStep;
      startedAt: number;
    };
  }
}
