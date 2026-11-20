import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { HalaqasService } from './halaqas.service';
import { HalaqasController } from './halaqas.controller';
import { EditHalaqaErrorFilter } from './filters/edit-halaqa-error.filter';

@Module({
  imports: [PrismaModule, AuditModule, AuthorizationModule],
  controllers: [HalaqasController],
  providers: [HalaqasService, EditHalaqaErrorFilter],
})
export class HalaqasModule {}
