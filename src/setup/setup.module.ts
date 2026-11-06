import { SetupCsrfGuard } from './helpers/decorators/setup-csrf.guard';
import { SetupErrorFilter } from './helpers/decorators/setup-error.filter';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
@Module({
  imports: [PrismaModule],
  controllers: [SetupController],
  providers: [SetupService, SetupCsrfGuard, SetupErrorFilter],
  exports: [SetupService],
})
export class SetupModule {}
