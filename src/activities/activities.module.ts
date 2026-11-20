import { AuditModule } from '../audit/audit.module';
import { Module } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CreateActivityErrorFilter } from './filters/create-activity-error.filter';

@Module({
  imports: [AuditModule, AuthorizationModule, PrismaModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, CreateActivityErrorFilter],
})
export class ActivitiesModule {}
