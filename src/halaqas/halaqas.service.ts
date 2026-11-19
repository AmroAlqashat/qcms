import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditTarget } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { createHalaqaDto } from './dto/create-halaqa.dto';

@Injectable()
export class HalaqasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getActiveTerm(termId: string) {
    if (!termId) throw new NotFoundException('الفصل غير موجود أو مؤرشف');
    const term = await this.prisma.terms.findFirst({
      where: { termId, archivedAt: null },
      select: { id: true, termId: true },
    });
    if (!term) throw new NotFoundException('الفصل غير موجود أو مؤرشف');
    return term;
  }

  async createHalaqa(dto: createHalaqaDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const term = await tx.terms.findFirst({
        where: { termId: dto.termId, archivedAt: null },
        select: { id: true },
      });
      if (!term) throw new NotFoundException('الفصل غير موجود أو مؤرشف');

      const halaqa = await tx.halaqas.create({
        data: {
          name: dto.name,
          meetingDays: {
            startTime: dto.meetingDays.startTime,
            endTime: dto.meetingDays.endTime,
          },
          termId: term.id,
        },
        select: { id: true, termId: true },
      });
      await this.audit.record(tx, {
        actorId,
        targetId: halaqa.id,
        isSuccess: true,
        targetType: AuditTarget.HALAQA,
        actionType: AuditAction.HALAQA_CREATED,
      });
      return halaqa;
    });
  }
}
