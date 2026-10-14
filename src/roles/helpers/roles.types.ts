import type { ScopeType } from '@prisma/client';

export type PermissionAction = {
  id: string;
  resource: string;
  action: string;
  scopes: ScopeType[];
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

export type PermissionGroupDraft = Omit<PermissionGroup, 'resources'> & {
  resources: Record<string, PermissionResource>;
};

export type PermissionColumns = PermissionGroup[][];

export type PermissionsData = {
  permissionColumns: PermissionColumns;
  selectedPermissionCount: number;
};
