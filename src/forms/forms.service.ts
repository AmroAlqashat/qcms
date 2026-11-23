import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, AuditTarget, Prisma, ScopeType } from '@prisma/client';
import { CreateFormDto } from './dto/create-form.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EditFormDto } from './dto/edit-form.dto';
import { AuthorizationService } from '../authorization/authorization.service';

const FORM_EDIT_LOCKED_MESSAGE = 'لا يمكن تعديل النموذج لأنه مستخدم في نشاط';
const FORM_DELETE_LOCKED_MESSAGE = 'لا يمكن حذف النموذج لأنه مستخدم في نشاط';

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async getForms() {
    return await this.prisma.forms.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { activities: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getForm(formId: string) {
    const form = await this.prisma.forms.findUnique({
      where: { id: formId },
      select: {
        id: true,
        name: true,
        form: true,
        _count: { select: { activities: true } },
      },
    });
    if (!form) throw new NotFoundException('النموذج غير موجود');
    return form;
  }

  async createForm(actorId: string, createFormDto: CreateFormDto) {
    const { name, form } = createFormDto;

    return this.prisma.$transaction(async (tx) => {
      const newForm = await tx.forms.create({
        data: {
          name,
          form: {
            display: form.display,
            // Safe: it came from a JSON request and validateFormComponents
            // already checked it.
            components: form.components as Prisma.InputJsonValue[],
          },
        },
        select: { id: true },
      });

      await this.audit.record(tx, {
        actorId,
        actionType: AuditAction.FORM_CREATED,
        targetType: AuditTarget.FORM,
        targetId: newForm.id,
        isSuccess: true,
      });

      return newForm;
    });
  }

  async editForm(actorId: string, formId: string, editFormDto: EditFormDto) {
    const { name, form } = editFormDto;

    await this.prisma.$transaction(async (tx) => {
      if (await this.isActivityFormLocked(formId, tx)) {
        throw new ConflictException(FORM_EDIT_LOCKED_MESSAGE);
      }

      const result = await tx.forms.updateMany({
        where: { id: formId },
        data: {
          name,
          form: {
            display: form.display,
            // Safe: it came from a JSON request and validateFormComponents
            // already checked it.
            components: form.components as Prisma.InputJsonValue[],
          },
        },
      });

      if (result.count === 0) {
        throw new NotFoundException('النموذج غير موجود');
      }

      await this.audit.record(tx, {
        actorId,
        actionType: AuditAction.FORM_UPDATED,
        targetType: AuditTarget.FORM,
        targetId: formId,
        isSuccess: true,
      });
    });
  }

  async deleteForm(actorId: string, formId: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        if (await this.isActivityFormLocked(formId, tx)) {
          throw new ConflictException(FORM_DELETE_LOCKED_MESSAGE);
        }

        const result = await tx.forms.deleteMany({
          where: { id: formId },
        });

        if (result.count === 0) {
          throw new NotFoundException('النموذج غير موجود');
        }

        await this.audit.record(tx, {
          actorId,
          actionType: AuditAction.FORM_DELETED,
          targetType: AuditTarget.FORM,
          targetId: formId,
          isSuccess: true,
        });
      });
    } catch (error) {
      // Safety net: an activity linked between the count and the delete
      // makes the database refuse it.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(FORM_DELETE_LOCKED_MESSAGE);
      }
      throw error;
    }
  }

  // A form used by any activity is locked for edit and delete: its
  // registration may be open, and the activity can't be left without a form.
  async isActivityFormLocked(
    formId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const linkedActivitiesCount = await tx.activities.count({
      where: { formId },
    });

    return linkedActivitiesCount > 0;
  }

  async formsListView(userId: string, scope: ScopeType, selectedId?: string) {
    const forms = await this.getForms();
    const firstId = selectedId ?? forms[0]?.id;

    const [selected, canCreateForm, canEditForm, canDeleteForm, lockEdit] =
      await Promise.all([
        firstId ? this.getForm(firstId) : null,
        this.authorizationService.hasPermission(
          userId,
          'forms',
          'create',
          scope,
        ),
        this.authorizationService.hasPermission(
          userId,
          'forms',
          'update',
          scope,
        ),
        this.authorizationService.hasPermission(
          userId,
          'forms',
          'delete',
          scope,
        ),
        firstId ? this.isActivityFormLocked(firstId) : false,
      ]);

    return {
      forms: forms.map((form) => ({
        id: form.id,
        name: form.name,
        activitiesCount: form._count.activities,
        isSelected: form.id === selected?.id,
      })),
      selected: selected && {
        id: selected.id,
        name: selected.name,
        form: selected.form,
        activitiesCount: selected._count.activities,
        isLocked: lockEdit,
      },
      permissions: { canCreateForm, canEditForm, canDeleteForm },
      title: selected ? `${selected.name} · النماذج` : 'النماذج',
      activeNav: 'forms',
      sectionTitle: 'النماذج',
    };
  }

  assertCenterWideScope(userScope: ScopeType) {
    if (userScope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException(
        'يتطلب هذا الإجراء صلاحية النماذج على مستوى المركز',
      );
    }
  }
}
