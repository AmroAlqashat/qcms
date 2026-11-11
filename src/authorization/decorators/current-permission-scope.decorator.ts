import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import type { Request } from 'express';

type PermissionScopedRequest = Request & {
  permissionScope?: ScopeType;
};

export const CurrentPermissionScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ScopeType => {
    const request = context
      .switchToHttp()
      .getRequest<PermissionScopedRequest>();

    if (!request.permissionScope) {
      throw new ForbiddenException('تعذر تحديد نطاق الصلاحية لهذا الطلب');
    }

    return request.permissionScope;
  },
);
