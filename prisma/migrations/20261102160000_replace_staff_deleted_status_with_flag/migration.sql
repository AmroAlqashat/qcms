BEGIN;

ALTER TABLE "StaffMembers" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- The former status did not retain whether the account was active or inactive.
-- Preserve deletion explicitly and use INACTIVE for these historical accounts.
UPDATE "StaffMembers"
SET "isDeleted" = true, "status" = 'INACTIVE'
WHERE "status" = 'DELETED';

CREATE TYPE "StaffStatus_new" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING');
ALTER TABLE "StaffMembers" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "StaffMembers" ALTER COLUMN "status" TYPE "StaffStatus_new"
USING ("status"::text::"StaffStatus_new");
ALTER TYPE "StaffStatus" RENAME TO "StaffStatus_old";
ALTER TYPE "StaffStatus_new" RENAME TO "StaffStatus";
DROP TYPE "StaffStatus_old";
ALTER TABLE "StaffMembers" ALTER COLUMN "status" SET DEFAULT 'INACTIVE';

COMMIT;
