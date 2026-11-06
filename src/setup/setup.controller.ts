import { Body, Controller, Get, UseFilters, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/route-access.decorator';
import { SetupService } from './setup.service';
import { SetupDto } from './dto/setup.dto';
import { SetupErrorFilter } from './helpers/decorators/setup-error.filter';
import { setSetupHeaders } from './helpers/setup-http';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Public()
  @Get()
  async showSetupPage(@Res() res: Response) {
    setSetupHeaders(res);
    const { needsSetup, available } = await this.setupService.getSetupStatus();
    return res.status(needsSetup ? 200 : 403).render('auth/setup-page', {
      layout: 'auth',
      title: 'إعداد المركز',
      available,
      needsToken: needsSetup && !available,
    });
  }

  @Public()
  @Post()
  @UseFilters(SetupErrorFilter)
  async completeSetup(@Body() dto: SetupDto, @Res() res: Response) {
    setSetupHeaders(res);
    await this.setupService.completeSetup(dto);
    return res.render('auth/setup-page', {
      layout: 'auth',
      title: 'اكتمل الإعداد',
      complete: true,
    });
  }
}
