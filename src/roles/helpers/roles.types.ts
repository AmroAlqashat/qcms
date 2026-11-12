import type { ScopeType } from '@prisma/client';

export type PermissionAction = {
  id: string;
  resource: number;
  action: number;
  actionName: string;
  scopeOptions: { value: ScopeType; label: string }[];
  selected: boolean;
  selectedScope?: string;
};

export type PermissionResource = {
  name: string;
  actions: PermissionAction[];
};

export type PermissionGroup = {
  category: string;
  selectedCount: number;
  resources: PermissionResource[];
};

export type PermissionsData = {
  permissionGroups: PermissionGroup[];
  selectedPermissionCount: number;
};
