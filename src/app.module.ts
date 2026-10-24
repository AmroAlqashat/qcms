import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SessionAuthGuard } from './auth/guards/session-auth.guard';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { RolesModule } from './roles/roles.module';
import { StaffModule } from './staff/staff.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuditModule,
    RolesModule,
    StaffModule,
    AuthModule,
    SettingsModule,
    MailModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: SessionAuthGuard }],
})
export class AppModule {}
