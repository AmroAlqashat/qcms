import type { permission_actions, permission_resources } from '@prisma/client';
import { Reflector } from '@nestjs/core';

export type PermissionAccess = {
  permission_action: permission_actions['eng_name'];
  permission_resource: permission_resources['eng_name'];
};

export const permission = Reflector.createDecorator<PermissionAccess>();
