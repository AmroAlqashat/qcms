import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
@Module({
  imports: [PrismaModule],
  controllers: [SetupController],
  providers: [SetupService],
  exports: [SetupService],
})
export class SetupModule {}
