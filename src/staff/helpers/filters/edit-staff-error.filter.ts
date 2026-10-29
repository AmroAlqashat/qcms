import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../../../common/wants-html';
import { EditStaffDto } from '../../dto/edit-staff.dto';
import { StaffService } from '../../staff.service';
import { staffShell } from '../staff-shell';

@Catch(ConflictException, UnprocessableEntityException)
export class EditStaffErrorFilter implements ExceptionFilter {
  constructor(private readonly staffService: StaffService) {}

  async catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (!wantsHtml(req)) {
      res
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body }
            : body,
        );
      return;
    }

    const errors =
      typeof body === 'object'
        ? (body as { errors?: Record<string, string> }).errors
        : undefined;
    const staffId = req.params.id;
    if (typeof staffId !== 'string') {
      throw new Error('Edit staff error filter requires a single staff ID');
    }

    const staff = await this.staffService.showStaffEditPage(staffId);
    const form = req.body as Partial<EditStaffDto>;

    res
      .status(status)
      .setHeader('X-QCMS-Fragment', 'true')
      .render(
        'staff/staff-edit-profile-page',
        staffShell({
          staff: {
            ...staff,
            fullName: form.fullName ?? staff.fullName,
            email: form.email ?? staff.email,
            nationalId: form.nationalId ?? staff.nationalId,
            jobTitle: form.jobTitle ?? staff.jobTitle,
            phone: form.phoneNumber ?? staff.phone,
            dateOfBirthValue:
              form.dateOfBirth ??
              staff.dateOfBirth?.toISOString().slice(0, 10) ??
              '',
            permissions: {
              canChangeStatus: true,
            },
          },
          errors,
          error: errors ? undefined : exception.message,
          activeNav: 'staff',
        }),
      );
  }
}
