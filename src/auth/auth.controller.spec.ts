import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService, OnboardingStage } from './auth.service';

// JWT verification is injected below so these tests exercise controller behavior
// without loading the ESM JWT package in the project's CJS Jest runner.
jest.mock('@nestjs/jwt', () => ({ JwtService: jest.fn() }));

const staffId = '10000000-0000-4000-8000-000000000001';
const credentials = {
  email: 'staff@example.com',
  password: 'test-only-password',
};
const session = {
  kind: 'signed-in',
  accessToken: 'test-access',
  refreshToken: 'test-refresh',
};
const onboarding = (stage: OnboardingStage) => ({
  kind: 'onboarding',
  stage,
  token: 'test-onboarding',
});

function setup(stage: OnboardingStage = 'verify-otp') {
  const service = {
    signInHelper: jest.fn().mockResolvedValue(session),
    verifyOnboardingOtp: jest
      .fn()
      .mockResolvedValue(onboarding('change-password')),
    changeOnboardingPassword: jest
      .fn()
      .mockResolvedValue(onboarding('complete-profile')),
    completePendingOnboarding: jest.fn().mockResolvedValue(session),
  };
  const jwt = {
    verifyAsync: jest
      .fn()
      .mockResolvedValue({ sub: staffId, tokenUse: 'onboarding', stage }),
  };
  const response = {
    setHeader: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  };
  const request = {
    cookies: { onboarding_token: 'test-onboarding' },
  } as unknown as Request;
  const controller = new AuthController(
    service as unknown as AuthService,
    jwt as unknown as JwtService,
  );
  return {
    controller,
    service,
    jwt,
    response,
    res: response as unknown as Response,
    request,
  };
}

describe('AuthController sign-in and onboarding redirects', () => {
  it('sends regular staff to the staff area with session cookies', async () => {
    const { controller, service, response, res } = setup();
    await controller.signInStaff(res, credentials);
    expect(service.signInHelper).toHaveBeenCalledWith(credentials);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
    expect(response.redirect).toHaveBeenCalledWith(303, '/staff');
    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(response.cookie).toHaveBeenCalledWith(
      'access_token',
      'test-access',
      expect.objectContaining({
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
      }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'test-refresh',
      expect.objectContaining({ path: '/auth/refresh', httpOnly: true }),
    );
  });

  it.each<OnboardingStage>([
    'verify-otp',
    'change-password',
    'complete-profile',
  ])(
    'redirects an onboarding result to %s with only an onboarding cookie',
    async (stage) => {
      const { controller, service, response, res } = setup();
      service.signInHelper.mockResolvedValue(onboarding(stage));
      await controller.signInStaff(res, credentials);
      expect(response.redirect).toHaveBeenCalledWith(
        303,
        `/auth/onboarding/${stage}`,
      );
      expect(response.cookie).toHaveBeenCalledTimes(1);
      expect(response.cookie).toHaveBeenCalledWith(
        'onboarding_token',
        'test-onboarding',
        expect.objectContaining({
          path: '/auth/onboarding',
          httpOnly: true,
          sameSite: 'strict',
          maxAge: 900_000,
        }),
      );
    },
  );

  it('sets no cookies or success redirect when credentials are rejected', async () => {
    const { controller, service, response, res } = setup();
    service.signInHelper.mockRejectedValue(new UnauthorizedException());
    await expect(controller.signInStaff(res, credentials)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(response.cookie).not.toHaveBeenCalled();
    expect(response.redirect).not.toHaveBeenCalled();
  });

  it('continues to password setup after successful verification', async () => {
    const { controller, service, response, res, request } = setup();
    await controller.verifyOtp(request, res, { code: '123456' });
    expect(service.verifyOnboardingOtp).toHaveBeenCalledWith(staffId, '123456');
    expect(response.redirect).toHaveBeenCalledWith(
      303,
      '/auth/onboarding/change-password',
    );
    expect(response.cookie).toHaveBeenCalledTimes(1);
    expect(response.cookie).toHaveBeenCalledWith(
      'onboarding_token',
      'test-onboarding',
      expect.any(Object),
    );
  });

  it('continues pending staff to profile completion after password setup', async () => {
    const { controller, response, res, request } = setup('change-password');
    await controller.changePassword(request, res, {
      newPassword: credentials.password,
      confirmPassword: credentials.password,
    });
    expect(response.redirect).toHaveBeenCalledWith(
      303,
      '/auth/onboarding/complete-profile',
    );
    expect(response.cookie).toHaveBeenCalledTimes(1);
    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  it('finishes a required password change for active staff', async () => {
    const { controller, service, response, res, request } =
      setup('change-password');
    service.changeOnboardingPassword.mockResolvedValue(session);
    await controller.changePassword(request, res, {
      newPassword: credentials.password,
      confirmPassword: credentials.password,
    });
    expect(response.clearCookie).toHaveBeenCalledWith('onboarding_token', {
      path: '/auth/onboarding',
    });
    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(response.redirect).toHaveBeenCalledWith(303, '/staff');
  });

  it('finishes profile onboarding with session cookies and a staff redirect', async () => {
    const { controller, service, response, res, request } =
      setup('complete-profile');
    const profile = { fullName: 'Test Staff', jobTitle: 'Teacher' };
    await controller.completeProfile(request, res, profile);
    expect(service.completePendingOnboarding).toHaveBeenCalledWith(
      staffId,
      profile,
    );
    expect(response.clearCookie).toHaveBeenCalledWith('onboarding_token', {
      path: '/auth/onboarding',
    });
    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(response.cookie).toHaveBeenCalledWith(
      'access_token',
      'test-access',
      expect.any(Object),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'test-refresh',
      expect.any(Object),
    );
    expect(response.redirect).toHaveBeenCalledWith(303, '/staff');
  });

  it('rejects a token from an earlier stage before profile completion', async () => {
    const { controller, service, response, res, request } = setup('verify-otp');
    await expect(
      controller.completeProfile(request, res, {
        fullName: 'Test Staff',
        jobTitle: 'Teacher',
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.completePendingOnboarding).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('rejects an expired onboarding token', async () => {
    const { controller, service, jwt, res, request } = setup();
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    await expect(
      controller.verifyOtp(request, res, { code: '123456' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.verifyOnboardingOtp).not.toHaveBeenCalled();
  });
});
