import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { wantsHtml } from '../../common/wants-html';
import { InviteStaffDto } from '../dto/invite-staff.dto';
import { staffShell } from './staff-shell';

@Catch(ConflictException, UnprocessableEntityException)
export class InviteStaffErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (!wantsHtml(req)) {
      res
        .status(status)
        .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
      return;
    }

    const errors =
      typeof body === 'object'
        ? (body as { errors?: Record<string, string> }).errors
        : undefined;

    res.status(status).render(
      'staff/invite-staff-error',
      staffShell({
        title: 'تعذّر إنشاء الحساب',
        form: req.body as Partial<InviteStaffDto>,
        errors,
        error: errors ? undefined : exception.message,
      }),
    );
  }
}
