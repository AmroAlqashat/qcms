import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Render,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AuthService, OnboardingStage } from './auth.service';
import { ChangeOnboardingPasswordDto } from './dto/change-onboarding-password.dto';
import { CompleteOnboardingProfileDto } from './dto/complete-onboarding-profile.dto';
import { SignInDto } from './dto/auth.signIn.dto';
import { VerifyOnboardingOtpDto } from './dto/verify-onboarding-otp.dto';

const ONBOARDING_COOKIE = 'onboarding_token';
const ONBOARDING_COOKIE_MAX_AGE = 15 * 60 * 1000;

type OnboardingPayload = {
  sub: string;
  tokenUse: 'onboarding';
  stage: OnboardingStage;
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Get('sign-in')
  @Render('Auth/sign-in-page')
  showSignInPage() {
    return {
      title: 'تسجيل الدخول',
      layout: false,
    };
  }

  @Post('sign-in')
  async signInStaff(@Res() res: Response, @Body() signInDto: SignInDto) {
    res.setHeader('Cache-Control', 'no-store');
    const result = await this.authService.signInHelper(signInDto);

    if (result.kind === 'onboarding') {
      this.setOnboardingCookie(res, result.token);
      res.redirect(303, this.onboardingPath(result.stage));
      return;
    }

    this.setSessionCookies(res, result.accessToken, result.refreshToken);
    res.redirect(303, '/staff');
  }

  @Get('onboarding/verify-otp')
  async showOtpForm(@Req() req: Request, @Res() res: Response) {
    await this.getOnboardingPayload(req, 'verify-otp');
    res.setHeader('Cache-Control', 'no-store');
    res.render('Auth/onboarding-otp-page', {
      title: 'التحقق من البريد',
      layout: false,
    });
  }

  @Post('onboarding/verify-otp')
  async verifyOtp(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: VerifyOnboardingOtpDto,
  ) {
    const { sub } = await this.getOnboardingPayload(req, 'verify-otp');
    const result = await this.authService.verifyOnboardingOtp(sub, dto.code);
    this.setOnboardingCookie(res, result.token);
    res.redirect(303, this.onboardingPath(result.stage));
  }

  @Get('onboarding/change-password')
  async showPasswordForm(@Req() req: Request, @Res() res: Response) {
    await this.getOnboardingPayload(req, 'change-password');
    res.setHeader('Cache-Control', 'no-store');
    res.render('Auth/onboarding-password-page', {
      title: 'تغيير كلمة المرور',
      layout: false,
    });
  }

  @Post('onboarding/change-password')
  async changePassword(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: ChangeOnboardingPasswordDto,
  ) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }

    const { sub } = await this.getOnboardingPayload(req, 'change-password');
    const result = await this.authService.changeOnboardingPassword(sub, dto);
    if (result.kind === 'onboarding') {
      this.setOnboardingCookie(res, result.token);
      res.redirect(303, this.onboardingPath(result.stage));
      return;
    }

    this.completeSignIn(res, result.accessToken, result.refreshToken);
  }

  @Get('onboarding/complete-profile')
  async showProfileForm(@Req() req: Request, @Res() res: Response) {
    const { sub } = await this.getOnboardingPayload(req, 'complete-profile');
    const form = await this.authService.getOnboardingProfile(sub);
    res.setHeader('Cache-Control', 'no-store');
    res.render('Auth/onboarding-profile-page', {
      title: 'استكمال البيانات',
      layout: false,
      form,
    });
  }

  @Post('onboarding/complete-profile')
  async completeProfile(
    @Req() req: Request,
    @Res() res: Response,
    @Body() dto: CompleteOnboardingProfileDto,
  ) {
    const { sub } = await this.getOnboardingPayload(req, 'complete-profile');
    const result = await this.authService.completePendingOnboarding(sub, dto);
    this.completeSignIn(res, result.accessToken, result.refreshToken);
  }

  @Post('refresh')
  async refreshToken(@Req() req: Request, @Res() res: Response) {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const refreshToken = cookies?.['refresh_token'];
    if (typeof refreshToken !== 'string') {
      throw new UnauthorizedException('please log in first');
    }

    const payload = await this.jwtService.verifyAsync<{
      sub: string;
      tokenUse: string;
    }>(refreshToken);
    if (payload.tokenUse !== 'refresh') {
      throw new UnauthorizedException('invalid refresh token');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: payload.sub,
      tokenUse: 'access',
    });
    res.cookie(
      'access_token',
      accessToken,
      this.cookieOptions(5 * 60 * 1000, '/'),
    );
    res.redirect(303, '/staff');
  }

  private async getOnboardingPayload(
    req: Request,
    requiredStage: OnboardingStage,
  ): Promise<OnboardingPayload> {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[ONBOARDING_COOKIE];
    if (typeof token !== 'string') {
      throw new UnauthorizedException('Onboarding session is missing');
    }

    let payload: OnboardingPayload;
    try {
      payload = await this.jwtService.verifyAsync<OnboardingPayload>(token);
    } catch {
      throw new UnauthorizedException('Onboarding session has expired');
    }

    if (
      payload.tokenUse !== 'onboarding' ||
      typeof payload.sub !== 'string' ||
      payload.stage !== requiredStage
    ) {
      throw new UnauthorizedException('Invalid onboarding session');
    }
    return payload;
  }

  private setOnboardingCookie(res: Response, token: string) {
    res.cookie(
      ONBOARDING_COOKIE,
      token,
      this.cookieOptions(ONBOARDING_COOKIE_MAX_AGE, '/auth/onboarding'),
    );
  }

  private setSessionCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    res.cookie(
      'access_token',
      accessToken,
      this.cookieOptions(5 * 60 * 1000, '/'),
    );
    res.cookie(
      'refresh_token',
      refreshToken,
      this.cookieOptions(7 * 24 * 60 * 60 * 1000, '/auth/refresh'),
    );
  }

  private cookieOptions(maxAge: number, path: string) {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      maxAge,
      path,
    };
  }

  private completeSignIn(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    res.clearCookie(ONBOARDING_COOKIE, { path: '/auth/onboarding' });
    this.setSessionCookies(res, accessToken, refreshToken);
    res.redirect(303, '/staff');
  }

  private onboardingPath(stage: OnboardingStage) {
    switch (stage) {
      case 'verify-otp':
        return '/auth/onboarding/verify-otp';
      case 'change-password':
        return '/auth/onboarding/change-password';
      case 'complete-profile':
        return '/auth/onboarding/complete-profile';
    }
  }
}
