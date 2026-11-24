import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, AuditTarget, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { isRegistrationOpen } from '../activities/helpers/registration';
import { ApplyActivityDto } from './dto/apply-activity.dto';
import { validateFormAnswers } from '../forms/helpers/validate-form-answers';

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getActivityForm(activityId: string) {
    const activity = await this.prisma.activities.findUnique({
      where: { id: activityId, archivedAt: null },
      select: {
        name: true,
        date: true,
        location: true,
        isFormEnabled: true,
        formClosesAt: true,
        form: {
          select: {
            form: true,
          },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException('النشاط غير موجود');
    }

    const isFormOpen = isRegistrationOpen(activity);

    // The page is public: send the form schema only while it is open.
    return {
      activity: {
        name: activity.name,
        date: activity.date,
        location: activity.location,
      },
      form: isFormOpen ? activity.form.form : null,
      isFormOpen,
    };
  }

  // A public applicant is an existing student: found by national ID and
  // date of birth, then added to the activity with their form answers.
  // Serializable, like manual registration: two identical submissions at the
  // same moment can't both pass the duplicate check.
  async applyToActivity(activityId: string, dto: ApplyActivityDto) {
    await this.prisma.$transaction(
      async (tx) => {
        const activity = await tx.activities.findUnique({
          where: { id: activityId, archivedAt: null },
          select: {
            isFormEnabled: true,
            formClosesAt: true,
            date: true,
            halaqaId: true,
            form: { select: { form: true } },
          },
        });
        if (!activity) throw new NotFoundException('النشاط غير موجود');
        if (!isRegistrationOpen(activity))
          throw new ConflictException('التسجيل في هذا النشاط مغلق');

        // Birth dates are stored at UTC midnight, so the UTC date is the day.
        // A halaqa activity accepts only that halaqa's current students;
        // staff can still register others manually.
        const student = await tx.students.findUnique({
          where: {
            nationalId: dto.nationalId,
            dateOfBirth: new Date(`${dto.dateOfBirth}T00:00:00.000Z`),
            ...(activity.halaqaId
              ? {
                  enrollments: {
                    some: {
                      halaqaId: activity.halaqaId,
                      endedAt: null,
                      halaqa: { archivedAt: null, term: { archivedAt: null } },
                    },
                  },
                }
              : {}),
          },
          select: { id: true },
        });
        // One message for every miss, so it never tells which part was wrong.
        if (!student)
          throw new UnprocessableEntityException({
            message:
              'لم يتم العثور على طالب بهذه البيانات. تواصل مع إدارة المركز.',
          });

        const result = validateFormAnswers(activity.form.form, dto.formAnswers);
        if (result.error !== undefined)
          throw new UnprocessableEntityException({
            message: result.error,
            errors: { formAnswers: result.error },
          });

        const duplicate = await tx.activityParticipants.findUnique({
          where: {
            activityId_studentId: { activityId, studentId: student.id },
          },
          select: { id: true },
        });
        if (duplicate)
          throw new ConflictException('هذا الطالب مسجّل في النشاط مسبقًا');

        await tx.activityParticipants.create({
          data: {
            activityId,
            studentId: student.id,
            formAnswers: result.answers as Prisma.InputJsonObject,
          },
        });

        // No actorId: the applicant is not a staff member.
        await this.audit.record(tx, {
          targetId: activityId,
          targetType: AuditTarget.ACTIVITY,
          actionType: AuditAction.ACTIVITY_REGISTRATION,
          isSuccess: true,
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
