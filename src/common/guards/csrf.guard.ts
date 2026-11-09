import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

// Validate the form submitted token against user session token.
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;

    // Guards run before validation pipes strip the hidden input from the DTO.
    const body = req.body as Record<string, unknown> | undefined;
    const submitted = typeof body?._csrf === 'string' ? body._csrf : '';
    const saved = req.session?.csrfToken;

    // Validate both lengths before the constant-time comparison.
    if (
      !saved ||
      !/^[a-f0-9]{64}$/.test(submitted) ||
      !/^[a-f0-9]{64}$/.test(saved) ||
      !timingSafeEqual(Buffer.from(submitted), Buffer.from(saved))
    ) {
      throw new ForbiddenException({
        message: 'تعذر التحقق من الطلب. حدّث الصفحة ثم حاول مرة أخرى.',
        code: 'CSRF_INVALID',
      });
    }

    // Keep the session token so other forms and open tabs remain valid.
    return true;
  }
}
