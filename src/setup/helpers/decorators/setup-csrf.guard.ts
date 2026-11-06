import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class SetupCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const body = req.body as Record<string, unknown> | undefined;

    // Get CSRF token from hidden input that its value is the csrf token. Check csrf.hbs
    const submitted = typeof body?._csrf === 'string' ? body._csrf : '';

    // Get the CSRF token from the user session
    const saved = req.session?.setupCsrf;

    // Check for them and throw errors
    if (
      !saved ||
      !/^[a-f0-9]{64}$/.test(submitted) ||
      !/^[a-f0-9]{64}$/.test(saved) ||
      !timingSafeEqual(Buffer.from(submitted), Buffer.from(saved))
    ) {
      throw new ForbiddenException({
        message: 'جلسة الإعداد غير صالحة. أعد فتح صفحة الإعداد.',
        code: 'SETUP_CSRF',
      });
    }
    return true;
  }
}
