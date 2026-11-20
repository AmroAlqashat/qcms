import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ArchiveController } from './archive.controller';
import { ArchiveService } from './archive.service';
@Module({
  imports: [PrismaModule, AuthorizationModule],
  controllers: [ArchiveController],
  providers: [ArchiveService],
})
export class ArchiveModule {}
