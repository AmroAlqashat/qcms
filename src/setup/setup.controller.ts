import {
  Body,
  Controller,
  Get,
  UseFilters,
  UseGuards,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { Public } from '../auth/decorators/route-access.decorator';
import { saveSession } from '../auth/helpers/sessions.helpers';
import { SetupService } from './setup.service';
import { SetupDto } from './dto/setup.dto';
import { SetupCsrfGuard } from './helpers/decorators/setup-csrf.guard';
import { SetupErrorFilter } from './helpers/decorators/setup-error.filter';
import { setSetupHeaders } from './helpers/setup-http';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Public()
  @Get()
  async showSetupPage(@Req() req: Request, @Res() res: Response) {
    setSetupHeaders(res);
    const { needsSetup, available } = await this.setupService.getSetupStatus();
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
  @UseGuards(SetupCsrfGuard)
  @UseFilters(SetupErrorFilter)
  async completeSetup(
    @Body() dto: SetupDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    setSetupHeaders(res);
    await this.setupService.completeSetup(dto);
    delete req.session.setupCsrf;
    await saveSession(req);
    return res.render('auth/setup-page', {
      layout: 'auth',
      title: 'اكتمل الإعداد',
      complete: true,
    });
  }
}
