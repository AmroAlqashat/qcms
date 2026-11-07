import { SetupErrorFilter } from './helpers/decorators/setup-error.filter';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
@Module({
  imports: [PrismaModule],
  controllers: [SetupController],
  providers: [SetupService, SetupErrorFilter],
  exports: [SetupService],
})
export class SetupModule {}
