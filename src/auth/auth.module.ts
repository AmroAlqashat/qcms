import { SetupModule } from '../setup/setup.module';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, AuditModule, MailModule, SetupModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
