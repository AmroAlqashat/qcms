import { Module } from '@nestjs/common';
import { TermsService } from './terms.service';
import { TermsController } from './terms.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CreateTermErrorFilter } from './filters/create-term-error.filter';

@Module({
  imports: [PrismaModule, AuditModule, AuthorizationModule],
  controllers: [TermsController],
  providers: [TermsService, CreateTermErrorFilter],
})
export class TermsModule {}
