import { SetupModule } from './setup/setup.module';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { SessionAuthGuard } from './auth/guards/session-auth.guard';
import { PermissionGuard } from './authorization/guards/permission-authorization.guard';
import { AuthorizationModule } from './authorization/authorization.module';
import { CsrfGuard } from './common/guards/csrf.guard';
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
import { MailerModule } from '@nestjs-modules/mailer';
import { NavigationPermissionsInterceptor } from './common/interceptors/navigation-permissions.interceptor';
import { TermsModule } from './terms/terms.module';
import { HalaqasModule } from './Halaqas/halaqas.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SetupModule,
    AuditModule,
    RolesModule,
    HalaqasModule,
    StaffModule,
    AuthModule,
    AuthorizationModule,
    SettingsModule,
    MailModule,
    MailerModule.forRoot({
      transport: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // true for port 465, false for other ports
        auth: {
          user: process.env.EMAIL_SENDER_ADDRESS,
          pass: process.env.EMAIL_APP_PASSWORD,
        },
      },
      defaults: {
        from: `"No Reply" ${process.env.EMAIL_SENDER_ADDRESS}`,
      },
    }),
    TermsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    // Keep authorization after authentication while reusing the module provider.
    { provide: APP_GUARD, useExisting: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: NavigationPermissionsInterceptor },
  ],
})
export class AppModule {}
