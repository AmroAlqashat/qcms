import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): { id: string } => {
    const request = ctx.switchToHttp().getRequest<{ user?: { id: string } }>();

    // Real path, once auth sets request.user
    if (request.user) return request.user;

    // Placeholder, dev only
    if (process.env.NODE_ENV === 'production' || !process.env.DEV_ACTOR_ID) {
      throw new UnauthorizedException();
    }
    return { id: process.env.DEV_ACTOR_ID };
  },
);
