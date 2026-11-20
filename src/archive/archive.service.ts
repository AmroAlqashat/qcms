import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ArchiveService {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthorizationService,
  ) {}
  async list(actorId: string, type: string, search: string, page: number) {
    const can = (resource: string) =>
      this.auth.hasPermission(actorId, resource, 'read', 'CENTER_WIDE');
    const [terms, halaqas, activities, assignedActivities, assignedHalaqas] =
      await Promise.all([
        can('terms'),
        can('halaqas'),
        can('activities'),
        this.auth.hasPermission(
          actorId,
          'activities',
          'read',
          'ASSIGNED_CLASS',
        ),
        this.auth.hasPermission(actorId, 'halaqas', 'read', 'ASSIGNED_CLASS'),
      ]);
    const sources: Prisma.Sql[] = [];
    if (terms)
      sources.push(
        Prisma.sql`SELECT id,"termId" AS name,'terms' AS kind,"archivedAt" FROM "Terms"`,
      );
    if (halaqas || assignedHalaqas)
      sources.push(
        Prisma.sql`SELECT h.id,h.name,'halaqas' AS kind,COALESCE(h."archivedAt",t."archivedAt") AS "archivedAt" FROM "Halaqas" h JOIN "Terms" t ON t.id=h."termId" WHERE ${halaqas} OR EXISTS(SELECT 1 FROM "StaffClassAssignments" s WHERE s."halaqaId"=h.id AND s."staffId"=${actorId} AND s."endedAt" IS NULL)`,
      );
    if (activities || assignedActivities)
      sources.push(
        Prisma.sql`SELECT a.id,a.name,'activities' AS kind,COALESCE(a."archivedAt",h."archivedAt",t."archivedAt") AS "archivedAt" FROM "Activities" a LEFT JOIN "Halaqas" h ON h.id=a."halaqaId" LEFT JOIN "Terms" t ON t.id=h."termId" WHERE ${activities} OR EXISTS(SELECT 1 FROM "StaffClassAssignments" s WHERE s."halaqaId"=h.id AND s."staffId"=${actorId} AND s."endedAt" IS NULL)`,
      );
    const rows = sources.length
      ? await this.db.$queryRaw<
          { id: string; name: string; kind: string; archivedAt: Date }[]
        >`SELECT * FROM (${Prisma.join(sources, ' UNION ALL ')}) entries WHERE "archivedAt" IS NOT NULL AND (${type}='' OR kind=${type}) AND strpos(lower(name),lower(${search}))>0 ORDER BY "archivedAt" DESC,kind,id LIMIT 26 OFFSET ${(page - 1) * 25}`
      : [];
    const link = (n: number) =>
      '/archive?' +
      new URLSearchParams({ type, q: search, page: String(n) }).toString();
    return {
      rows: rows.slice(0, 25).map((row) => ({
        ...row,
        label: { terms: 'فصل', halaqas: 'حلقة', activities: 'نشاط' }[row.kind],
        date: row.archivedAt.toLocaleDateString('ar-JO'),
      })),
      canArchiveActivities: await this.auth.hasPermission(
        actorId,
        'activities',
        'delete',
        'CENTER_WIDE',
      ),
      canArchiveTerms: await this.auth.hasPermission(
        actorId,
        'terms',
        'delete',
        'CENTER_WIDE',
      ),
      canArchiveHalaqas: await this.auth.hasPermission(
        actorId,
        'halaqas',
        'delete',
        'CENTER_WIDE',
      ),
      terms,
      halaqas: halaqas || assignedHalaqas,
      activities: activities || assignedActivities,
      type,
      search,
      previous: page > 1 ? link(page - 1) : null,
      next: rows.length > 25 ? link(page + 1) : null,
    };
  }

  async options(kind: 'terms' | 'halaqas' | 'activities') {
    if (kind === 'activities')
      return this.db.activities.findMany({
        where: {
          archivedAt: null,
          OR: [
            { halaqaId: null },
            { halaqa: { archivedAt: null, term: { archivedAt: null } } },
          ],
        },
        select: { id: true, name: true },
        orderBy: { date: 'desc' },
      });
    if (kind === 'terms')
      return (
        await this.db.terms.findMany({
          where: { archivedAt: null },
          select: { id: true, termId: true },
          orderBy: { termId: 'desc' },
        })
      ).map((t) => ({ id: t.id, name: t.termId }));
    return (
      await this.db.halaqas.findMany({
        where: { archivedAt: null, term: { archivedAt: null } },
        select: { id: true, name: true, term: { select: { termId: true } } },
        orderBy: { name: 'asc' },
      })
    ).map((h) => ({ id: h.id, name: h.name + ' · ' + h.term.termId }));
  }
  async archive(
    kind: 'terms' | 'halaqas' | 'activities',
    id: string,
    actorId: string,
  ) {
    await this.db.$transaction(
      async (tx) => {
        const data = { archivedAt: new Date() };
        const result =
          kind === 'activities'
            ? await tx.activities.updateMany({
                where: {
                  id,
                  archivedAt: null,
                  OR: [
                    { halaqaId: null },
                    {
                      halaqa: { archivedAt: null, term: { archivedAt: null } },
                    },
                  ],
                },
                data,
              })
            : kind === 'terms'
              ? await tx.terms.updateMany({
                  where: { id, archivedAt: null },
                  data,
                })
              : await tx.halaqas.updateMany({
                  where: { id, archivedAt: null, term: { archivedAt: null } },
                  data,
                });
        if (!result.count)
          throw new NotFoundException('السجل غير موجود أو مؤرشف');
        await tx.auditEvents.create({
          data: {
            actorId,
            targetId: id,
            targetType:
              kind === 'activities'
                ? 'ACTIVITY'
                : kind === 'terms'
                  ? 'TERM'
                  : 'HALAQA',
            actionType:
              kind === 'activities'
                ? 'ACTIVITY_ARCHIVED'
                : kind === 'terms'
                  ? 'TERM_ARCHIVED'
                  : 'HALAQA_ARCHIVED',
            isSuccess: true,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
