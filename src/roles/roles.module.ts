import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { RolesErrorFilter } from './helpers/roles-error.filter';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [RolesController],
  providers: [RolesService, RolesErrorFilter],
})
export class RolesModule {}
