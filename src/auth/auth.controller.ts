import { SignInErrorFilter } from './filters/sign-in-error.filter';
import { OnboardingErrorFilter } from './filters/onboarding-error.filter';
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public, Onboarding } from './decorators/route-access.decorator';
import { AuthService } from './auth.service';
import { ChangeOnboardingPasswordDto } from './dto/change-onboarding-password.dto';
import { CompleteOnboardingProfileDto } from './dto/complete-onboarding-profile.dto';
import { SignInDto } from './dto/auth.signIn.dto';
import { OtpDto } from './dto/otp.dto';
import { OtpService } from '../mail/otp.serivce';
import { destroySession, regenerateSession, saveSession } from './helpers/sessions.helpers';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otp: OtpService,
  ) { }

  @Public()
  @Get('signIn')
  showSignInPage(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');

    return res.render('auth/sign-in-page', {
      title: 'تسجيل الدخول',
      layout: 'auth',
    });
  }

  @Public()
  @UseFilters(SignInErrorFilter)
  @Post('signIn')
  async signInStaff(@Body() signInDto: SignInDto, @Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');

    const redirectPath: string = await this.authService.signIn(signInDto, req);

    if (req.get('HX-Request') === 'true') {
      res.setHeader('HX-Redirect', redirectPath);
      return res.status(204).send();
    }

    return res.redirect(303, redirectPath);
  }

  @Onboarding('VERIFY_OTP')
  @Get('onboarding/verify-otp')
  showOtpPage(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');

    const onboarding = req.session.onboardingStep;

    if (
      !onboarding ||
      onboarding.step !== 'VERIFY_OTP' ||
      Date.now() - onboarding.startedAt > 30 * 60 * 1000
    ) {
      throw new UnauthorizedException('جلسة التحقق غير صالحة');
    }

    return res.render('auth/onboarding-otp-page', {
      title: 'التحقق من البريد',
      layout: 'auth',
    });
  }

  @Onboarding('VERIFY_OTP')
  @UseFilters(OnboardingErrorFilter)
  @Post('onboarding/send-otp')
  async issueOtp(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');

    const onboarding = req.session.onboardingStep;

    if (
      !onboarding ||
      onboarding.step !== 'VERIFY_OTP' ||
      Date.now() - onboarding.startedAt > 30 * 60 * 1000
    ) {
      throw new UnauthorizedException('جلسة التحقق غير صالحة');
    }

    await this.otp.issueOtp(onboarding.staffId);

    return res.status(200).json({
      message: 'تم إرسال رمز التحقق',
    });
  }

  @Onboarding('VERIFY_OTP')
  @UseFilters(OnboardingErrorFilter)
  @Post('onboarding/verify-otp')
  async verifyOtp(@Req() req: Request, @Res() res: Response, @Body() otpDto: OtpDto) {
    res.setHeader('Cache-Control', 'no-store');

    const onboarding = req.session.onboardingStep;

    if (
      !onboarding ||
      onboarding.step !== 'VERIFY_OTP' ||
      Date.now() - onboarding.startedAt > 30 * 60 * 1000
    ) {
      throw new UnauthorizedException('جلسة التحقق غير صالحة');
    }

    await this.otp.verifyOnboardingOtp(onboarding.staffId, otpDto.code);

    req.session.onboardingStep = {
      ...onboarding,
      step: 'COMPLETE_PROFILE',
    };

    await saveSession(req);

    const redirectPath = '/auth/onboarding/complete-profile';

    if (req.get('HX-Request') === 'true') {
      res.setHeader('HX-Redirect', redirectPath);
      return res.status(204).send();
    }

    return res.redirect(303, redirectPath);
  }

  @Onboarding('COMPLETE_PROFILE')
  @Get('onboarding/complete-profile')
  async showProfileForm(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');

    const onboarding = req.session.onboardingStep;

    if (
      !onboarding ||
      onboarding.step !== 'COMPLETE_PROFILE' ||
      Date.now() - onboarding.startedAt > 30 * 60 * 1000
    ) {
      throw new UnauthorizedException('استكمال معلومات الحساب غير متاح');
    }

    const form = await this.authService.getOnboardingProfile(onboarding.staffId);

    return res.render('auth/onboarding-profile-page', {
      title: 'استكمال البيانات',
      layout: 'auth',
      form,
    });
  }

  @Onboarding('COMPLETE_PROFILE')
  @UseFilters(OnboardingErrorFilter)
  @Post('onboarding/complete-profile')
  async completeProfile(@Req() req: Request, @Res() res: Response, @Body() dto: CompleteOnboardingProfileDto) {
    res.setHeader('Cache-Control', 'no-store');

    const onboarding = req.session.onboardingStep;

    if (
      !onboarding ||
      onboarding.step !== 'COMPLETE_PROFILE' ||
      Date.now() - onboarding.startedAt > 30 * 60 * 1000
    ) {
      throw new UnauthorizedException('استكمال معلومات الحساب غير متاح');
    }

    await this.authService.completeOnboardingProfile(onboarding.staffId, dto);

    req.session.onboardingStep = {
      ...onboarding,
      step: 'CHANGE_PASSWORD',
    };

    await saveSession(req);

    const redirectPath = '/auth/onboarding/change-password';

    if (req.get('HX-Request') === 'true') {
      res.setHeader('HX-Redirect', redirectPath);
      return res.status(204).send();
    }

    return res.redirect(303, redirectPath);
  }

  @Onboarding('CHANGE_PASSWORD')
  @Get('onboarding/change-password')
  showPasswordPage(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');

    const onboarding = req.session.onboardingStep;

    if (
      !onboarding ||
      onboarding.step !== 'CHANGE_PASSWORD' ||
      Date.now() - onboarding.startedAt > 30 * 60 * 1000
    ) {
      throw new UnauthorizedException('جلسة تغيير كلمة المرور غير صالحة');
    }

    return res.render('auth/onboarding-password-page', {
      title: 'تغيير كلمة المرور',
      layout: 'auth',
    });
  }

  @Onboarding('CHANGE_PASSWORD')
  @UseFilters(OnboardingErrorFilter)
  @Post('onboarding/change-password')
  async changePassword(@Req() req: Request, @Res() res: Response, @Body() dto: ChangeOnboardingPasswordDto) {
    res.setHeader('Cache-Control', 'no-store');

    const onboarding = req.session.onboardingStep;

    if (
      !onboarding ||
      onboarding.step !== 'CHANGE_PASSWORD' ||
      Date.now() - onboarding.startedAt > 30 * 60 * 1000
    ) {
      throw new UnauthorizedException('جلسة تغيير كلمة المرور غير صالحة');
    }

    const staffId = onboarding.staffId;

    await this.authService.changeOnboardingPassword(staffId, dto);

    // A new session ID replaces the onboarding session.
    await regenerateSession(req);

    req.session.staffId = staffId;
    req.session.loggedInAt = Date.now();

    await saveSession(req);

    const redirectPath = `/staff/${staffId}`;

    if (req.get('HX-Request') === 'true') {
      res.setHeader('HX-Redirect', redirectPath);
      return res.status(204).send();
    }

    return res.redirect(303, redirectPath);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');

    await destroySession(req);

    const isProduction = process.env.NODE_ENV === 'production';

    res.clearCookie(
      isProduction ? '__Host-qcms.sid' : 'qcms.sid',
      {
        path: '/',
        secure: isProduction,
        sameSite: 'lax',
      },
    );

    if (req.get('HX-Request') === 'true') {
      res.setHeader('HX-Redirect', '/auth/signIn');
      return res.status(204).send();
    }

    return res.redirect(303, '/auth/signIn');
  }
}
