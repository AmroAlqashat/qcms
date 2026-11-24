import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Render,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { Public } from '../auth/decorators/route-access.decorator';
import { ApplyActivityDto } from './dto/apply-activity.dto';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  // Public: students have no accounts, they open a link shared by the center.
  @Get('activities/:activityId')
  @Public()
  @Render('applications/apply')
  async showActivityApplicationForm(
    @Param('activityId', ParseUUIDPipe) activityId: string,
  ) {
    const { activity, form, isFormOpen } =
      await this.applicationsService.getActivityForm(activityId);

    return {
      activity: {
        ...activity,
        dateLabel: new Intl.DateTimeFormat('ar-JO', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: 'Asia/Amman',
        }).format(activity.date),
      },
      activityId,
      form,
      isFormOpen,
      title: `التسجيل في ${activity.name}`,
      layout: 'public',
    };
  }

  // Sent as JSON by apply-form.js; errors come back as JSON too (422/409).
  @Post('activities/:activityId')
  @Public()
  @HttpCode(201)
  async applyToActivity(
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Body() dto: ApplyActivityDto,
  ) {
    await this.applicationsService.applyToActivity(activityId, dto);
    return { message: 'تم التسجيل بنجاح' };
  }
}
