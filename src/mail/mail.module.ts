import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { OtpService } from './otp.serivce';
import { PrismaModule } from '../prisma/prisma.module';
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [PrismaModule, MailerModule],
  providers: [MailService, OtpService],
  exports: [OtpService],
})
export class MailModule {}
