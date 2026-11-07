import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): { id: string } => {
    const request = ctx.switchToHttp().getRequest<{ user?: { id: string } }>();

    // Only the global session guard establishes the authenticated identity.
    if (!request.user?.id) throw new UnauthorizedException();
    return request.user;
  },
);
