import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { OtpService } from './otp.serivce';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MailService, OtpService],
  exports: [OtpService],
})
export class MailModule { }
