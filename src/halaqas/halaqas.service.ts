import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, AuditTarget, ScopeType } from '@prisma/client';
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

  async getActiveTerms() {
    return this.prisma.terms.findMany({
      where: { archivedAt: null },
      select: { id: true, termId: true },
      orderBy: { termId: 'desc' },
    });
  }

  async getHalaqa(id: string, scope: ScopeType) {
    if (scope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException(
        'يتطلب عرض تفاصيل الحلقة صلاحية على مستوى المركز',
      );
    }

    const halaqa = await this.prisma.halaqas.findFirst({
      where: { id, archivedAt: null, term: { archivedAt: null } },
      select: {
        id: true,
        name: true,
        meetingDays: true,
        term: { select: { id: true, termId: true } },
        _count: {
          select: {
            enrollments: { where: { endedAt: null } },
            staffAssignments: { where: { endedAt: null } },
          },
        },
      },
    });
    if (!halaqa) throw new NotFoundException('الحلقة غير موجودة أو مؤرشفة');
    return halaqa;
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

  async updateHalaqa(id: string, dto: createHalaqaDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.halaqas.findFirst({
        where: { id, archivedAt: null, term: { archivedAt: null } },
        select: { id: true },
      });
      if (!current) {
        throw new NotFoundException('الحلقة غير موجودة أو مؤرشفة');
      }

      const term = await tx.terms.findFirst({
        where: { termId: dto.termId, archivedAt: null },
        select: { id: true },
      });
      if (!term) throw new NotFoundException('الفصل غير موجود أو مؤرشف');

      const halaqa = await tx.halaqas.update({
        where: { id },
        data: {
          name: dto.name,
          meetingDays: {
            startTime: dto.meetingDays.startTime,
            endTime: dto.meetingDays.endTime,
          },
          termId: term.id,
        },
        select: { id: true },
      });
      await this.audit.record(tx, {
        actorId,
        targetId: halaqa.id,
        isSuccess: true,
        targetType: AuditTarget.HALAQA,
        actionType: AuditAction.HALAQA_EDITED,
      });
      return halaqa;
    });
  }
}
