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

@Injectable()
export class FormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
      // Activities.formId references the form, so the database refuses
      // to delete a form that an activity still uses.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException('لا يمكن حذف النموذج لأنه مستخدم في نشاط');
      }
      throw error;
    }
  }

  assertCenterWideScope(userScope: ScopeType) {
    if (userScope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException(
        'يتطلب هذا الإجراء صلاحية النماذج على مستوى المركز',
      );
    }
  }
}
