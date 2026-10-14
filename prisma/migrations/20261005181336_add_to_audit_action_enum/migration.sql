/*
  Warnings:

  - The values [STAFF_CREATED] on the enum `AuditAction` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AuditAction_new" AS ENUM ('STAFF_ONBOARDING_COMPLETED', 'STAFF_INVITED', 'STAFF_ACTIVATED', 'STAFF_DEACTIVATED', 'STAFF_DELETED', 'STAFF_UPDATED', 'STAFF_ROLE_ASSIGNED', 'STAFF_ROLE_REMOVED', 'ROLE_CREATED', 'ROLE_UPDATED', 'ROLE_DELETED');
ALTER TABLE "AuditEvent" ALTER COLUMN "actionType" TYPE "AuditAction_new" USING ("actionType"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "public"."AuditAction_old";
COMMIT;
