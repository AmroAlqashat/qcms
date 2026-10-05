import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [AuditService, PrismaService]
})
export class AuditModule {}
