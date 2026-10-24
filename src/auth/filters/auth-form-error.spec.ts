import {
  ArgumentsHost,
  HttpException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SignInErrorFilter } from './sign-in-error.filter';
import { OnboardingErrorFilter } from './onboarding-error.filter';

function setup(path: string, mode = 'html') {
  const response = {
    headersSent: false,
    setHeader: jest.fn(),
    set: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    render: jest.fn(),
    json: jest.fn(),
  };
  const request = {
    path,
    body: {
      email: 'staff@example.com',
      password: 'SECRET',
      newPassword: 'SECRET',
      confirmPassword: 'SECRET',
      code: '123456',
      fullName: 'Name',
      jobTitle: 'Teacher',
      phone: '123',
      nationalId: '456',
      dateOfBirth: '2000-01-01',
    },
    get: () => (mode === 'htmx' ? 'true' : undefined),
    accepts: () => (mode === 'json' ? 'json' : 'html'),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { response, host };
}

describe('Auth form error filters', () => {
  it('returns invalid credentials on sign-in and preserves only email', () => {
    const { host, response } = setup('/auth/signIn');
    new SignInErrorFilter().catch(
      new UnauthorizedException('Invalid credentials'),
      host,
    );
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.render).toHaveBeenCalledWith(
      'auth/sign-in-page',
      expect.objectContaining({
        layout: 'auth',
        form: { email: 'staff@example.com' },
        error: 'Invalid credentials',
      }),
    );
  });
  it.each(['verify-otp', 'complete-profile', 'change-password'])(
    'renders field errors on %s',
    (step) => {
      const { host, response } = setup(`/auth/onboarding/${step}`);
      new OnboardingErrorFilter().catch(
        new UnprocessableEntityException({ errors: { code: 'Invalid code' } }),
        host,
      );
      expect(response.render).toHaveBeenCalledWith(
        step === 'verify-otp'
          ? 'auth/onboarding-otp-page'
          : step === 'complete-profile'
            ? 'auth/onboarding-profile-page'
            : 'auth/onboarding-password-page',
        expect.objectContaining({
          errors: { code: 'Invalid code' },
          layout: 'auth',
        }),
      );
      const output = JSON.stringify(response.render.mock.calls);
      expect(output).not.toContain('SECRET');
      expect(output).not.toContain('123456');
      if (step === 'complete-profile') expect(output).toContain('2000-01-01');
    },
  );
  it('targets the form content for HTMX validation errors', () => {
    const { host, response } = setup('/auth/signIn', 'htmx');
    new SignInErrorFilter().catch(new UnauthorizedException(), host);
    expect(response.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'HX-Retarget': '#main-content',
        'X-QCMS-Fragment': 'true',
      }),
    );
    expect(response.render).toHaveBeenCalledWith(
      'auth/sign-in-page',
      expect.objectContaining({ layout: false }),
    );
  });
  it('keeps API errors as JSON', () => {
    const { host, response } = setup('/auth/signIn', 'json');
    new SignInErrorFilter().catch(new UnauthorizedException(), host);
    expect(response.json).toHaveBeenCalled();
    expect(response.render).not.toHaveBeenCalled();
  });
  it('returns resend errors as JSON for the status message', () => {
    const { host, response } = setup('/auth/onboarding/send-otp', 'htmx');
    new OnboardingErrorFilter().catch(
      new HttpException('Wait a minute', 429),
      host,
    );
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 429,
      message: 'Wait a minute',
    });
    expect(response.render).not.toHaveBeenCalled();
  });
  it('does not expose resend server error details', () => {
    const { host, response } = setup('/auth/onboarding/send-otp', 'htmx');
    new OnboardingErrorFilter().catch(
      new HttpException('private details', 500),
      host,
    );
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(
      'private details',
    );
  });
});
