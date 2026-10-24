import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { wantsHtml } from '../../common/wants-html';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ROUTE_ACCESS,
  RouteAccess,
} from '../decorators/route-access.decorator';
import { destroySession } from '../helpers/sessions.helpers';

type AuthenticatedRequest = Request & { user?: { id: string } };

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    delete request.user;
    const access = this.reflector.getAllAndOverride<RouteAccess>(ROUTE_ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (access?.kind === 'public') return true;

    if (access?.kind === 'onboarding') {
      const onboarding = request.session?.onboardingStep;
      if (
        !onboarding ||
        onboarding.step !== access.stage ||
        typeof onboarding.staffId !== 'string' ||
        !onboarding.staffId ||
        !Number.isFinite(onboarding.startedAt) ||
        onboarding.startedAt > Date.now() ||
        Date.now() - onboarding.startedAt >= 30 * 60 * 1000
      )
        return this.deny(request, response);

      const staff = await this.loadStaff(onboarding.staffId);
      if (
        !staff ||
        staff.status !== StaffStatus.PENDING ||
        !staff.mustChangePassword
      ) {
        await destroySession(request);
        return this.deny(request, response);
      }
      // Onboarding authorizes only this step; it does not establish request.user.
      return true;
    }

    const staffId = request.session?.staffId;
    if (typeof staffId !== 'string' || !staffId)
      return this.deny(request, response);

    const staff = await this.loadStaff(staffId);
    if (
      !staff ||
      staff.status !== StaffStatus.ACTIVE ||
      staff.mustChangePassword
    ) {
      await destroySession(request);
      return this.deny(request, response);
    }
    request.user = { id: staff.id };
    return true;
  }

  private loadStaff(id: string) {
    return this.prisma.staffMembers.findUnique({
      where: { id },
      select: { id: true, status: true, mustChangePassword: true },
    });
  }

  private deny(request: Request, response: Response): false {
    response.setHeader('Cache-Control', 'no-store');
    if (request.get('HX-Request') === 'true') {
      response.setHeader('HX-Redirect', '/auth/signIn');
      response.status(401).end();
      return false;
    }
    if (wantsHtml(request)) {
      response.redirect(303, '/auth/signIn');
      return false;
    }
    throw new UnauthorizedException('يرجى تسجيل الدخول أولًا');
  }
}
