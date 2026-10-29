import 'express-session';

type OnboardingStep = 'VERIFY_OTP' | 'COMPLETE_PROFILE' | 'CHANGE_PASSWORD';

declare module 'express-session' {
  interface SessionData {
    staffId?: string;
    loggedInAt?: number;

    onboardingStep?: {
      staffId: string;
      step: OnboardingStep;
      startedAt: number;
    };
  }
}
