-- Reverse the settings audit enum additions without deleting audit history.
BEGIN;
LOCK TABLE "AuditEvents" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "AuditEvents"
    WHERE "actionType"::text = 'SETTINGS_UPDATED' OR "targetType"::text = 'SETTINGS'
  ) THEN
    RAISE EXCEPTION 'Settings audit records exist; refusing to remove their enum values';
  END IF;
END $$;

-- AlterEnum
CREATE TYPE "AuditAction_new" AS ENUM ('STAFF_ONBOARDING_COMPLETED', 'STAFF_INVITED', 'STAFF_ACTIVATED', 'STAFF_DEACTIVATED', 'STAFF_DELETED', 'STAFF_UPDATED', 'STAFF_ROLE_ASSIGNED', 'STAFF_ROLE_REMOVED', 'ROLE_CREATED', 'ROLE_UPDATED', 'ROLE_DELETED');
ALTER TABLE "AuditEvents" ALTER COLUMN "actionType" TYPE "AuditAction_new" USING ("actionType"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "AuditAction_old";

-- AlterEnum
CREATE TYPE "AuditTarget_new" AS ENUM ('STAFF', 'STUDENT', 'ROLE');
ALTER TABLE "AuditEvents" ALTER COLUMN "targetType" TYPE "AuditTarget_new" USING ("targetType"::text::"AuditTarget_new");
ALTER TYPE "AuditTarget" RENAME TO "AuditTarget_old";
ALTER TYPE "AuditTarget_new" RENAME TO "AuditTarget";
DROP TYPE "AuditTarget_old";

COMMIT;
