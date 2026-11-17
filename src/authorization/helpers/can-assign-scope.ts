import { ScopeType } from '@prisma/client';

const scopeRank: Record<ScopeType, number> = {
  [ScopeType.CENTER_WIDE]: 0,
  [ScopeType.ASSIGNED_CLASS]: 1,
  [ScopeType.OWN_ACCOUNT]: 2,
};

export function canAssignScope(
  grantedScopes: ReadonlySet<ScopeType> | undefined,
  requestedScope: ScopeType,
): boolean {
  if (!grantedScopes) return false;
  return [...grantedScopes].some(
    (grantedScope) => scopeRank[grantedScope] <= scopeRank[requestedScope],
  );
}
