import {
  ActivityAttendanceDto,
  RegisterActivityDto,
  RegisterGuestDto,
  ReturningGuestDto,
} from './dto/activity-roster.dto';
import { isActivityDay } from './helpers/activity-view';
import {
  ForbiddenException,
  UnprocessableEntityException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeType } from '@prisma/client';
import { CreateActivityDto } from './dto/create-activity.dto';

@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getActivities(actorId: string, scope: ScopeType) {
    return await this.prisma.activities.findMany({
      where: { ...this.visibility(actorId, scope), ...this.active },
      orderBy: { date: 'asc' },
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
      where: { archivedAt: null, term: { archivedAt: null } },
      select: {
        id: true,
        name: true,
        term: { select: { termId: true } },
      },
      orderBy: [{ term: { termId: 'desc' } }, { name: 'asc' }],
    });
  }

  async saveActivity(
    createActivityDto: CreateActivityDto,
    actorId: string,
    id?: string,
  ) {
    const { name, level, halaqaId, location, date } = createActivityDto;

    return this.prisma.$transaction(
      async (tx) => {
        if (halaqaId) {
          const halaqa = await tx.halaqas.findFirst({
            where: {
              id: halaqaId,
              archivedAt: null,
              term: { archivedAt: null },
            },
            select: { id: true },
          });

          if (!halaqa) {
            throw new NotFoundException(
              'الحلقة المحددة غير موجودة أو تتبع فصلًا مؤرشفًا',
            );
          }
        }

        const data = {
          name,
          level,
          location,
          date: new Date(date + 'T' + createActivityDto.time + ':00+03:00'),
          halaqaId: halaqaId ?? null,
        };
        if (
          id &&
          !(await tx.activities.findFirst({ where: { id, ...this.active } }))
        )
          throw new NotFoundException('النشاط غير موجود أو مؤرشف');
        const activity = id
          ? await tx.activities.update({ where: { id }, data })
          : await tx.activities.create({ data });
        const template = Number(createActivityDto.template) || null;
        const closesAt =
          template && createActivityDto.closeDate
            ? new Date(createActivityDto.closeDate + ':00+03:00')
            : null;
        if (closesAt && closesAt > data.date)
          throw new UnprocessableEntityException(
            'يجب إغلاق التقديم قبل موعد النشاط',
          );
        const form = { enabled: !!template, template, closesAt };
        await tx.forms.upsert({
          where: { activityId: activity.id },
          create: {
            activityId: activity.id,
            kind: 'ACTIVITY_APPLICATION',
            ...form,
          },
          update: form,
        });
        await this.audit.record(tx, {
          actorId,
          targetId: activity.id,
          targetType: 'ACTIVITY',
          actionType: id ? 'ACTIVITY_UPDATED' : 'ACTIVITY_CREATED',
          isSuccess: true,
        });
        return activity;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private readonly active = {
    archivedAt: null,
    OR: [
      { halaqaId: null },
      { halaqa: { archivedAt: null, term: { archivedAt: null } } },
    ],
  };
  private visibility(actorId: string, scope: ScopeType) {
    this.assertCenterWideOrAssignedClassScope(scope);
    return scope === ScopeType.CENTER_WIDE
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
  }
  async getActivityData(actorId: string, id: string, scope: ScopeType) {
    const activity = await this.prisma.activities.findFirst({
      where: { id, ...this.visibility(actorId, scope) },
      include: {
        form: true,
        halaqa: { include: { term: true } },
        participants: {
          select: {
            id: true,
            guest: { select: { fullName: true } },
            student: { select: { fullName: true } },
            attendanceStatus: true,
          },
          orderBy: { student: { fullName: 'asc' } },
        },
      },
    });
    if (!activity) throw new NotFoundException('النشاط غير موجود');
    return activity;
  }
  async isAssigned(staffId: string, halaqaId: string) {
    return !!(await this.prisma.staffClassAssignments.findFirst({
      where: { staffId, halaqaId, endedAt: null },
      select: { id: true },
    }));
  }
  async eligibleStudents(actorId: string, id: string, scope: ScopeType) {
    const activity = await this.prisma.activities.findFirst({
      where: { id, ...this.active, ...this.visibility(actorId, scope) },
      select: { halaqaId: true },
    });
    if (!activity) throw new NotFoundException('النشاط غير متاح');
    return this.prisma.students.findMany({
      where: {
        ...(activity.halaqaId
          ? {
              enrollments: {
                some: { halaqaId: activity.halaqaId, endedAt: null },
              },
            }
          : {}),
        activityEntries: { none: { activityId: id } },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async register(
    id: string,
    actorId: string,
    scope: ScopeType,
    dto: RegisterActivityDto,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const activity = await tx.activities.findFirst({
          where: { id, ...this.active, ...this.visibility(actorId, scope) },
        });
        if (!activity) throw new NotFoundException('النشاط غير متاح');
        const { halaqaId } = activity;
        const student = await tx.students.findFirst({
          where: {
            id: dto.studentId,
            ...(halaqaId
              ? {
                  enrollments: {
                    some: {
                      halaqaId,
                      endedAt: null,
                      halaqa: { archivedAt: null, term: { archivedAt: null } },
                    },
                  },
                }
              : {}),
          },
          select: { id: true },
        });
        if (!student)
          throw new UnprocessableEntityException(
            'هذا الطالب غير متاح للتسجيل في النشاط',
          );
        const result = await tx.activityParticipants.createMany({
          data: { studentId: student.id, activityId: id },
          skipDuplicates: true,
        });
        if (result.count)
          await this.audit.record(tx, {
            actorId,
            targetId: id,
            targetType: 'ACTIVITY',
            actionType: 'ACTIVITY_REGISTRATION',
            isSuccess: true,
          });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private previousActivity(actorId: string, id: string, scope: ScopeType) {
    return {
      some: {
        activityId: { not: id },
        activity: this.visibility(actorId, scope),
      },
    };
  }

  async previousGuests(actorId: string, id: string, scope: ScopeType) {
    return this.prisma.guests.findMany({
      where: {
        activityEntries: {
          ...this.previousActivity(actorId, id, scope),
          none: { activityId: id },
        },
      },
      select: { id: true, fullName: true, guardianName: true },
      orderBy: [{ fullName: 'asc' }, { guardianName: 'asc' }, { id: 'asc' }],
    });
  }

  async registerGuest(
    id: string,
    actorId: string,
    scope: ScopeType,
    dto: RegisterGuestDto | ReturningGuestDto,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const activity = await tx.activities.findFirst({
          where: { id, ...this.active, ...this.visibility(actorId, scope) },
          select: { id: true },
        });
        if (!activity) throw new NotFoundException('النشاط غير متاح');
        if ('guestId' in dto) {
          const guest = await tx.guests.findFirst({
            where: {
              id: dto.guestId,
              activityEntries: this.previousActivity(actorId, id, scope),
            },
            select: { id: true },
          });
          if (!guest) throw new NotFoundException('الضيف غير متاح للتسجيل');
          const result = await tx.activityParticipants.createMany({
            data: { activityId: id, guestId: guest.id },
            skipDuplicates: true,
          });
          if (!result.count) return;
        } else {
          await tx.activityParticipants.create({
            data: {
              activity: { connect: { id } },
              guest: {
                create: {
                  fullName: dto.fullName,
                  guardianName: dto.guardianName,
                  guardianPhone: dto.guardianPhone,
                },
              },
            },
          });
        }
        await this.audit.record(tx, {
          actorId,
          targetId: id,
          targetType: 'ACTIVITY',
          actionType: 'ACTIVITY_REGISTRATION',
          isSuccess: true,
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async attendance(
    id: string,
    actorId: string,
    scope: ScopeType,
    dto: ActivityAttendanceDto,
  ) {
    await this.prisma.$transaction(
      async (tx) => {
        const activity = await tx.activities.findFirst({
          where: { id, ...this.active, ...this.visibility(actorId, scope) },
          select: { date: true, participants: { select: { id: true } } },
        });
        if (!activity) throw new NotFoundException('النشاط غير متاح');
        if (!isActivityDay(activity.date))
          throw new ForbiddenException('يُسجل الحضور في يوم النشاط فقط');
        const ids = new Set(activity.participants.map((p) => p.id));
        const present = dto.present ?? [];
        if (
          dto.roster.length !== ids.size ||
          [...dto.roster, ...present].some((id) => !ids.has(id))
        )
          throw new UnprocessableEntityException(
            'تغيرت قائمة المشاركين. أعد تحميل الصفحة',
          );
        await tx.activityParticipants.updateMany({
          where: { activityId: id, id: { notIn: present } },
          data: { attendanceStatus: 'ABSENT', attendedAt: null },
        });
        if (present.length)
          await tx.activityParticipants.updateMany({
            where: { activityId: id, id: { in: present } },
            data: { attendanceStatus: 'PRESENT', attendedAt: new Date() },
          });
        await this.audit.record(tx, {
          actorId,
          targetId: id,
          targetType: 'ACTIVITY',
          actionType: 'ACTIVITY_ATTENDANCE',
          isSuccess: true,
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
