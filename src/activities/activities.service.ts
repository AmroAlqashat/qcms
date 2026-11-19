import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeType } from '@prisma/client';
import { CreateActivityDto } from './dto/create-activity.dto';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async getActivities(actorId: string, scope: ScopeType) {
    const where =
      scope === ScopeType.CENTER_WIDE
        ? {}
        : {
            halaqa: {
              staffAssignments: {
                some: {
                  staffId: actorId,
                  endedAt: null,
                },
              },
            },
          };

    return await this.prisma.activities.findMany({
      where,
      select: {
        id: true,
        name: true,
        level: true,
        location: true,
        date: true,
        halaqa: {
          select: {
            name: true,
            term: { select: { termId: true } },
          },
        },
        _count: {
          select: {
            participants: true,
          },
        },
      },
    });
  }

  assertCenterWideOrAssignedClassScope(userScope: ScopeType) {
    if (userScope === ScopeType.CENTER_WIDE) {
      return ScopeType.CENTER_WIDE;
    } else if (userScope === ScopeType.ASSIGNED_CLASS) {
      return ScopeType.ASSIGNED_CLASS;
    } else {
      throw new ForbiddenException(
        'ليس لديك نطاق الصلاحية المطلوب لعرض الأنشطة',
      );
    }
  }

  assertCenterWideScope(userScope: ScopeType) {
    if (userScope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException(
        'ليس لديك نطاق الصلاحية المطلوب لإنشاء نشاط',
      );
    }
  }

  async getActiveHalaqas() {
    return this.prisma.halaqas.findMany({
      where: { term: { archivedAt: null } },
      select: {
        id: true,
        name: true,
        term: { select: { termId: true } },
      },
      orderBy: [{ term: { termId: 'desc' } }, { name: 'asc' }],
    });
  }

  async createActivity(createActivityDto: CreateActivityDto) {
    const { name, level, halaqaId, location, date } = createActivityDto;

    return this.prisma.$transaction(async (tx) => {
      if (halaqaId) {
        const halaqa = await tx.halaqas.findFirst({
          where: { id: halaqaId, term: { archivedAt: null } },
          select: { id: true },
        });

        if (!halaqa) {
          throw new NotFoundException(
            'الحلقة المحددة غير موجودة أو تتبع فصلًا مؤرشفًا',
          );
        }
      }

      return tx.activities.create({
        data: {
          name,
          level,
          location,
          date: new Date(`${date}T00:00:00.000Z`),
          halaqaId: halaqaId ?? null,
        },
      });
    });
  }
}
