import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import type { Request } from 'express';

type ActorEndpointPermissionScopedRequest = Request & {
  actorEndpointPermissionScope?: ScopeType;
};

export const ActorEndpointPermissionScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ScopeType => {
    const request = context
      .switchToHttp()
      .getRequest<ActorEndpointPermissionScopedRequest>();

    if (!request.actorEndpointPermissionScope) {
      throw new ForbiddenException('تعذر تحديد نطاق الصلاحية لهذا الطلب');
    }

    return request.actorEndpointPermissionScope;
  },
);
