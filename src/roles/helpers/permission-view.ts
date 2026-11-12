import type { Prisma, ScopeType } from '@prisma/client';
import { scopeLabels } from '../../common/scope-labels-map';
import type {
  PermissionGroup,
  PermissionResource,
  PermissionsData,
} from './roles.types';

export const permissionCatalogQuery = {
  orderBy: [{ category: 'asc' }, { resource: 'asc' }, { action: 'asc' }],
  select: {
    id: true,
    category: true,
    resource: true,
    action: true,
    allowedScopes: true,
    permission_resources: { select: { arb_name: true } },
    permission_actions: { select: { arb_name: true } },
  },
} satisfies Prisma.PermissionsFindManyArgs;

type CatalogPermission = Prisma.PermissionsGetPayload<{
  select: typeof permissionCatalogQuery.select;
}>;

// Role and direct-grant editors share grouping, labels, selection, and counts.
export function buildPermissionsData<T extends CatalogPermission>(
  permissions: T[],
  selectedScopes: (permission: T) => ScopeType[],
): PermissionsData {
  const permissionGroups: PermissionGroup[] = [];
  const groups = new Map<string, PermissionGroup>();
  const resources = new Map<PermissionGroup, Map<number, PermissionResource>>();
  let selectedPermissionCount = 0;

  for (const permission of permissions) {
    let group = groups.get(permission.category);
    if (!group) {
      group = {
        category: permission.category,
        selectedCount: 0,
        resources: [],
      };
      groups.set(permission.category, group);
      resources.set(group, new Map());
      permissionGroups.push(group);
    }
    const groupResources = resources.get(group)!;
    let resource = groupResources.get(permission.resource);
    if (!resource) {
      resource = {
        name: permission.permission_resources.arb_name,
        actions: [],
      };
      groupResources.set(permission.resource, resource);
      group.resources.push(resource);
    }

    const grantedScopes = selectedScopes(permission);
    // One dropdown per action: retain the first allowed saved scope, as before.
    const selectedScope = permission.allowedScopes.find((scope) =>
      grantedScopes.includes(scope),
    );
    const selected = selectedScope !== undefined;
    if (selected) {
      group.selectedCount++;
      selectedPermissionCount++;
    }
    resource.actions.push({
      id: permission.id,
      resource: permission.resource,
      action: permission.action,
      actionName: permission.permission_actions.arb_name,
      scopeOptions: permission.allowedScopes.map((scope) => ({
        value: scope,
        label: scopeLabels[scope],
      })),
      selected,
      selectedScope,
    });
  }

  return { permissionGroups, selectedPermissionCount };
}
