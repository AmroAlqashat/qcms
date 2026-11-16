import { SetMetadata } from '@nestjs/common';

export type OnboardingStage =
  'VERIFY_OTP' | 'COMPLETE_PROFILE' | 'CHANGE_PASSWORD';
export type RouteAccess =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'onboarding'; stage: OnboardingStage };

export const ROUTE_ACCESS = 'qcms:route-access';

// Absence of metadata always means a completed, active login is required.
export const Public = () => SetMetadata(ROUTE_ACCESS, { kind: 'public' });
export const AuthenticatedOnly = () =>
  SetMetadata(ROUTE_ACCESS, { kind: 'authenticated' });
export const Onboarding = (stage: OnboardingStage) =>
  SetMetadata(ROUTE_ACCESS, { kind: 'onboarding', stage });
