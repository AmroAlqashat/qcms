import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EditStaffErrorFilter } from './helpers/filters/edit-staff-error.filter';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [StaffController],
  providers: [StaffService, EditStaffErrorFilter],
})
export class StaffModule {}
