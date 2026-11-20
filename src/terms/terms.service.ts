import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditTarget,
  Prisma,
  ScopeType,
  TermType,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CreateTermDto } from './dto/create-term.dto';
import { FilteredTermsDto } from './dto/filter-terms.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createTerm(
    dto: CreateTermDto,
    actorId: string,
    actorEndpointPermissionScope: ScopeType,
  ) {
    if (actorEndpointPermissionScope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException('يتطلب إنشاء فصل صلاحية على مستوى المركز');
    }
    const startDate =
      dto.type === TermType.STANDARD
        ? new Date(`${dto.startDate}T00:00:00.000Z`)
        : null;
    const endDate =
      dto.type === TermType.STANDARD
        ? new Date(`${dto.endDate}T00:00:00.000Z`)
        : null;
    if (startDate && endDate && startDate >= endDate) {
      throw new UnprocessableEntityException(
        'يجب أن يكون تاريخ النهاية بعد تاريخ البداية',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const term = await tx.terms.create({
          data: { termId: dto.termId, type: dto.type, startDate, endDate },
        });
        await this.audit.record(tx, {
          actorId,
          actionType: AuditAction.TERM_CREATED,
          targetType: AuditTarget.TERM,
          targetId: term.id,
          isSuccess: true,
        });
        return term;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'معرّف الفصل مستخدم بالفعل، يرجى اختيار معرّف آخر',
        );
      }
      throw error;
    }
  }

  assertCenterWideScope(scope: ScopeType) {
    if (scope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException(
        'يتطلب هذا الإجراء صلاحية الفصول على مستوى المركز',
      );
    }
  }

  async getTerm(id: string, scope: ScopeType, canViewHalaqas: boolean) {
    this.assertCenterWideScope(scope);
    const term = await this.prisma.terms.findFirst({
      where: { id, archivedAt: null },
      select: {
        id: true,
        termId: true,
        type: true,
        startDate: true,
        endDate: true,
        _count: { select: { halaqas: { where: { archivedAt: null } } } },
        halaqas: canViewHalaqas
          ? {
              where: { archivedAt: null },
              orderBy: { name: 'asc' },
              select: {
                id: true,
                name: true,
                _count: {
                  select: {
                    enrollments: { where: { endedAt: null } },
                    staffAssignments: { where: { endedAt: null } },
                  },
                },
              },
            }
          : false,
      },
    });
    if (!term) throw new NotFoundException('الفصل غير موجود أو مؤرشف');
    return term;
  }

  async getTerms(filterDto?: FilteredTermsDto) {
    return await this.prisma.terms.findMany({
      where: {
        archivedAt: null,
        ...(filterDto?.termId
          ? { termId: { contains: filterDto.termId } }
          : {}),
      },
      select: {
        id: true,
        termId: true,
        type: true,
        startDate: true,
        endDate: true,
        _count: { select: { halaqas: { where: { archivedAt: null } } } },
      },
      orderBy: { termId: 'desc' },
    });
  }

  async getNextTermId() {
    const year = new Date().getFullYear().toString();

    const terms = await this.prisma.terms.findMany({
      where: { termId: { startsWith: year } },
      select: {
        termId: true,
      },
    });

    if (terms.length === 0) {
      return `${year}1`;
    }

    const termIds = terms.map((term) => Number(term.termId));
    const highestTermId = Math.max(...termIds);

    // Check max terms per year
    if (highestTermId % 10 === 9) {
      throw new ConflictException(
        'تم الوصول إلى الحد الأقصى لعدد الفصول لهذا العام',
      );
    }

    return String(highestTermId + 1);
  }
}
