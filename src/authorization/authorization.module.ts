import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationService } from './authorization.service';
import { PermissionGuard } from './guards/permission-authorization.guard';

@Module({
  imports: [PrismaModule],
  providers: [AuthorizationService, PermissionGuard],
  exports: [AuthorizationService, PermissionGuard],
})
export class AuthorizationModule {}
