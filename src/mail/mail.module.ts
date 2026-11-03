import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { OtpService } from './otp.serivce';
import { PrismaModule } from '../prisma/prisma.module';
import { ResendModule } from 'nestjs-resend';

@Module({
  imports: [
    PrismaModule,
    ResendModule.forRoot({ apiKey: process.env.RESEND_API_KEY }),
  ],
  providers: [MailService, OtpService],
  exports: [OtpService],
})
export class MailModule {}
