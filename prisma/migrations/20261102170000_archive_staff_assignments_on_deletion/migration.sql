BEGIN;

ALTER TABLE "StaffMembers"
  ALTER COLUMN "fullName" DROP NOT NULL,
  ALTER COLUMN "jobTitle" DROP NOT NULL,
  ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Existing assignment start dates are unknown; do not invent historical dates.
ALTER TABLE "StaffClassAssignments"
  ADD COLUMN "id" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "endedAt" TIMESTAMP(3);
UPDATE "StaffClassAssignments" SET "id" = gen_random_uuid()::text;
ALTER TABLE "StaffClassAssignments"
  ALTER COLUMN "id" SET NOT NULL,
  ALTER COLUMN "assignedAt" SET DEFAULT CURRENT_TIMESTAMP,
  DROP CONSTRAINT "StaffClassAssignments_pkey";
ALTER TABLE "StaffClassAssignments" ADD CONSTRAINT "StaffClassAssignments_pkey" PRIMARY KEY ("id");
CREATE INDEX "StaffClassAssignments_staffId_endedAt_idx" ON "StaffClassAssignments" ("staffId", "endedAt");
-- Multiple historical periods are allowed, but only one current assignment.
CREATE UNIQUE INDEX "StaffClassAssignments_current_unique" ON "StaffClassAssignments" ("staffId", "halaqaId") WHERE "endedAt" IS NULL;

ALTER TABLE "StaffActivityAssignments"
  ADD COLUMN "id" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "endedAt" TIMESTAMP(3);
UPDATE "StaffActivityAssignments" SET "id" = gen_random_uuid()::text;
ALTER TABLE "StaffActivityAssignments"
  ALTER COLUMN "id" SET NOT NULL,
  ALTER COLUMN "assignedAt" SET DEFAULT CURRENT_TIMESTAMP,
  DROP CONSTRAINT "StaffActivityAssignments_pkey";
ALTER TABLE "StaffActivityAssignments" ADD CONSTRAINT "StaffActivityAssignments_pkey" PRIMARY KEY ("id");
CREATE INDEX "StaffActivityAssignments_staffId_endedAt_idx" ON "StaffActivityAssignments" ("staffId", "endedAt");
CREATE UNIQUE INDEX "StaffActivityAssignments_current_unique" ON "StaffActivityAssignments" ("staffId", "activityId") WHERE "endedAt" IS NULL;

COMMIT;
