import {
  ActivityAttendanceDto,
  RegisterActivityDto,
  RegisterGuestDto,
  ReturningGuestDto,
} from './dto/activity-roster.dto';
import { isActivityDay } from './helpers/activity-view';
import { formatFormAnswers } from './helpers/format-form-answers';
import { validateFormAnswers } from '../forms/helpers/validate-form-answers';
import {
  ForbiddenException,
  UnprocessableEntityException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Prisma, ScopeType } from '@prisma/client';
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

  async getFormOptions() {
    return this.prisma.forms.findMany({
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
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

        const form = await tx.forms.findUnique({
          where: { id: createActivityDto.formId },
          select: { id: true },
        });
        if (!form)
          throw new UnprocessableEntityException({
            errors: { formId: 'النموذج المحدد غير موجود' },
          });

        const data = {
          formId: form.id,
          isFormEnabled: createActivityDto.isFormEnabled === 'true',
          formClosesAt: createActivityDto.closeDate
            ? new Date(createActivityDto.closeDate + ':00+03:00')
            : null,
          name,
          level,
          location,
          date: new Date(date + 'T' + createActivityDto.time + ':00+03:00'),
          halaqaId: halaqaId ?? null,
        };
        if (id) {
          const existing = await tx.activities.findFirst({
            where: { id, ...this.active },
            select: {
              formId: true,
              _count: { select: { participants: true } },
            },
          });
          if (!existing)
            throw new NotFoundException('النشاط غير موجود أو مؤرشف');
          // Participants' answers follow the current form, so it can't be
          // swapped for another once someone has registered.
          if (
            existing._count.participants > 0 &&
            existing.formId !== data.formId
          )
            throw new UnprocessableEntityException({
              errors: {
                formId: 'لا يمكن تغيير نموذج التسجيل لأن النشاط لديه مشاركون',
              },
            });
        }
        if (data.formClosesAt && data.formClosesAt > data.date)
          throw new UnprocessableEntityException({
            errors: { closeDate: 'يجب إغلاق التقديم قبل موعد النشاط أو عنده' },
          });
        const activity = id
          ? await tx.activities.update({ where: { id }, data })
          : await tx.activities.create({ data });
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
  // Same check as the public apply page, so every participant's answers
  // have the same shape whoever registered them.
  private checkFormAnswers(
    form: Prisma.JsonValue,
    answers: Record<string, unknown>,
  ): Prisma.InputJsonObject {
    const result = validateFormAnswers(form, answers);
    if (result.error !== undefined)
      throw new UnprocessableEntityException({
        message: result.error,
        errors: { formAnswers: result.error },
      });
    return result.answers as Prisma.InputJsonObject;
  }

  // One participant's answers, as rows staff can read. Same visibility as
  // the activity page: a teacher only reaches their own halaqa's activities.
  async getParticipantAnswers(
    actorId: string,
    activityId: string,
    participantId: string,
    scope: ScopeType,
  ) {
    const participant = await this.prisma.activityParticipants.findFirst({
      where: {
        id: participantId,
        activityId,
        activity: this.visibility(actorId, scope),
      },
      select: {
        formAnswers: true,
        student: { select: { fullName: true } },
        guest: { select: { fullName: true } },
        activity: { select: { form: { select: { name: true, form: true } } } },
      },
    });
    if (!participant) throw new NotFoundException('المشارك غير موجود');

    const name =
      participant.student?.fullName ?? participant.guest?.fullName ?? '';
    return {
      name,
      isGuest: !participant.student,
      formName: participant.activity.form.name,
      // {} = the form has no fields to answer.
      hasAnswers: Object.keys(participant.formAnswers ?? {}).length > 0,
      sections: formatFormAnswers(
        participant.activity.form.form,
        participant.formAnswers,
      ),
    };
  }

  async getActivityData(actorId: string, id: string, scope: ScopeType) {
    const activity = await this.prisma.activities.findFirst({
      where: { id, ...this.visibility(actorId, scope) },
      include: {
        form: { select: { id: true, name: true } },
        halaqa: { include: { term: true } },
        participants: {
          select: {
            id: true,
            guest: { select: { fullName: true } },
            student: { select: { fullName: true } },
            attendanceStatus: true,
            formAnswers: true,
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
      select: { halaqaId: true, form: { select: { form: true } } },
    });
    if (!activity) throw new NotFoundException('النشاط غير متاح');
    const canRegisterCenterStudents = scope === ScopeType.CENTER_WIDE;
    const listStudents = (halaqaId?: string) =>
      this.prisma.students.findMany({
        where: {
          ...(halaqaId && {
            enrollments: { some: { halaqaId, endedAt: null } },
          }),
          activityEntries: { none: { activityId: id } },
        },
        select: { id: true, fullName: true },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      });
    const [halaqaStudents, centerStudents] = await Promise.all([
      activity.halaqaId ? listStudents(activity.halaqaId) : [],
      canRegisterCenterStudents ? listStudents() : [],
    ]);
    return {
      // The dialog renders this form so staff fill the same answers.
      formSchema: activity.form.form,
      hasHalaqa: Boolean(activity.halaqaId),
      canRegisterCenterStudents,
      halaqaStudents,
      centerStudents,
    };
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
          include: { form: { select: { form: true } } },
        });
        if (!activity) throw new NotFoundException('النشاط غير متاح');
        const formAnswers = this.checkFormAnswers(
          activity.form.form,
          dto.formAnswers,
        );
        const { halaqaId } = activity;
        const student = await tx.students.findFirst({
          where: {
            id: dto.studentId,
            ...(scope === ScopeType.ASSIGNED_CLASS && halaqaId
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
          data: { studentId: student.id, activityId: id, formAnswers },
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
          select: { id: true, form: { select: { form: true } } },
        });
        if (!activity) throw new NotFoundException('النشاط غير متاح');
        const formAnswers = this.checkFormAnswers(
          activity.form.form,
          dto.formAnswers,
        );
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
            data: { activityId: id, guestId: guest.id, formAnswers },
            skipDuplicates: true,
          });
          if (!result.count) return;
        } else {
          await tx.activityParticipants.create({
            data: {
              formAnswers,
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
