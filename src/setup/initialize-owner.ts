import {
  AuditAction,
  AuditTarget,
  JobTitle,
  Prisma,
  ScopeType,
  StaffStatus,
} from '@prisma/client';
import { initializePermissions } from './initialize-permissions';
import { initializeSettings } from './initialize-settings';

// Called only inside the setup/recovery transaction, never from normal staff DTOs.
export async function initializeOwner(
  tx: Prisma.TransactionClient,
  details: { email: string; fullName: string; passwordHash: string },
  recovery = false,
) {
  await initializePermissions(tx);
  const owner = await tx.staffMembers.create({
    data: {
      ...details,
      jobTitle: JobTitle.ADMIN,
      isSuperAdmin: true,
      status: StaffStatus.ACTIVE,
      mustChangePassword: false,
    },
    select: { id: true },
  });
  // Use a dedicated role so creating the owner never elevates existing role members.
  const permissions = await tx.permissions.findMany({
    select: { id: true, allowedScopes: true },
  });
  const existingRole = await tx.roles.findFirst({
    where: { isSuperAdminRole: true, name: 'System Administrator' },
  });
  const role =
    existingRole ??
    (await tx.roles.create({
      data: {
        name: 'System Administrator',
        isSuperAdminRole: true,
        description: 'Full center access assigned during owner initialization.',
        rolePermissions: {
          create: permissions.flatMap((permission) => {
            // The current editor represents one scope per action. Prefer center-wide.
            const scopes = permission.allowedScopes.includes(
              ScopeType.CENTER_WIDE,
            )
              ? [ScopeType.CENTER_WIDE]
              : permission.allowedScopes;
            return scopes.map((scopeType) => ({
              permissionId: permission.id,
              scopeType,
            }));
          }),
        },
      },
    }));
  await tx.roleStaffAssignments.create({
    data: { staffId: owner.id, roleId: role.id, grantedById: owner.id },
  });
  await initializeSettings(tx, owner.id);
  await tx.auditEvents.create({
    data: {
      actorId: owner.id,
      targetId: owner.id,
      targetType: AuditTarget.STAFF,
      actionType: recovery
        ? AuditAction.SUPERADMIN_RECOVERED
        : AuditAction.SYSTEM_SETUP_COMPLETED,
      isSuccess: true,
    },
  });
  await tx.systemSetups.update({
    where: { id: 1 },
    data: {
      completedAt: new Date(),
      tokenHash: null,
      tokenExpiresAt: null,
      failedAttempts: 0,
    },
  });
  return owner;
}
