import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators/route-access.decorator';
import { saveSession } from '../auth/helpers/sessions.helpers';
import { SetupService } from './setup.service';
import { SetupDto } from './setup.dto';

@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  private headers(res: Response) {
    res.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'; form-action 'self'",
    });
  }

  @Public()
  @Get()
  async show(@Req() req: Request, @Res() res: Response) {
    this.headers(res);
    const needsSetup = await this.setup.needsInitialSetup();
    const available = needsSetup && (await this.setup.available());
    if (available) {
      req.session.setupCsrf = randomBytes(32).toString('hex');
      await saveSession(req);
    }
    return res.status(needsSetup ? 200 : 403).render('auth/setup-page', {
      layout: 'auth',
      title: 'إعداد المركز',
      available,
      needsToken: needsSetup && !available,
      csrfToken: req.session.setupCsrf,
    });
  }

  @Public()
  @Post()
  async complete(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.headers(res);
    const csrf = typeof body?._csrf === 'string' ? body._csrf : '';
    const saved = req.session.setupCsrf;
    if (
      !saved ||
      !/^[a-f0-9]{64}$/.test(csrf) ||
      csrf.length !== saved.length ||
      !timingSafeEqual(Buffer.from(csrf), Buffer.from(saved))
    ) {
      return res.status(403).render('auth/setup-page', {
        layout: 'auth',
        title: 'إعداد المركز',
        available: false,
      });
    }
    // Validate here so errors render in the setup form without reflecting secrets.
    const dto = plainToInstance(SetupDto, body);
    const validation = await validate(dto, {
      whitelist: true,
      validationError: { target: false, value: false },
    });
    const errors = Object.fromEntries(
      validation.map((item) => [
        item.property,
        Object.values(item.constraints ?? {})[0],
      ]),
    );
    if (dto.password !== dto.confirmPassword)
      errors.confirmPassword = 'كلمتا المرور غير متطابقتين.';
    const render = (status: number, error?: string) =>
      res.status(status).render('auth/setup-page', {
        layout: 'auth',
        title: 'إعداد المركز',
        available: true,
        csrfToken: saved,
        form: {
          fullName: typeof dto.fullName === 'string' ? dto.fullName : '',
          email: typeof dto.email === 'string' ? dto.email : '',
        },
        errors,
        error,
      });
    if (Object.keys(errors).length)
      return render(
        422,
        'يرجى تصحيح البيانات وإعادة إدخال الرمز وكلمة المرور.',
      );
    try {
      if (!(await this.setup.complete(dto)))
        return render(
          403,
          'رمز الإعداد غير صالح أو انتهت صلاحيته أو أغلق الإعداد. تواصل مع مسؤول التثبيت.',
        );
    } catch (error: unknown) {
      if (error instanceof HttpException && error.getStatus() < 500)
        return render(error.getStatus(), error.message);
      throw error;
    }
    delete req.session.setupCsrf;
    await saveSession(req);
    return res.render('auth/setup-page', {
      layout: 'auth',
      title: 'اكتمل الإعداد',
      complete: true,
    });
  }
}
