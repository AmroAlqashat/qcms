BEGIN;
ALTER TABLE "Roles" ADD COLUMN "isSuperAdminRole" BOOLEAN NOT NULL DEFAULT false;
-- Identify roles created by the previous setup implementation, including archived owners.
UPDATE "Roles" SET "isSuperAdminRole" = true
WHERE "name" ~ '^System owner [0-9a-f-]{36}$'
  AND "description" = 'Full center access assigned during owner initialization.';
-- Prefer the current owner's role if recovery left older system roles behind.
UPDATE "Roles" SET "name" = 'System Administrator'
WHERE "id" = (
 SELECT r."id" FROM "Roles" r WHERE r."isSuperAdminRole" = true
 ORDER BY EXISTS (SELECT 1 FROM "RoleStaffAssignments" a JOIN "StaffMembers" s ON s."id" = a."staffId"
 WHERE a."roleId" = r."id" AND s."isSuperAdmin" = true) DESC, r."createdAt" DESC LIMIT 1
);
COMMIT;
