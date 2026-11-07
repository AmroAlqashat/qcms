BEGIN;

CREATE TYPE "JobTitle" AS ENUM ('SUPERADMIN', 'ADMIN', 'TEACHER', 'FINANCE', 'MISC');
-- Explicitly approved corrections; job titles never imply administrative authority.
UPDATE "StaffMembers" SET "jobTitle" = 'ADMIN' WHERE "jobTitle" = 'Administrator';
UPDATE "StaffMembers" SET "jobTitle" = NULL WHERE "jobTitle" = 'amro';
-- Casting fails rather than silently assigning any other unknown title.
ALTER TABLE "StaffMembers" ALTER COLUMN "jobTitle" TYPE "JobTitle" USING ("jobTitle"::"JobTitle");
ALTER TABLE "StaffMembers" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "StaffMembers_single_superadmin" ON "StaffMembers" ("isSuperAdmin") WHERE "isSuperAdmin" = true;

CREATE TABLE "SystemSetups" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "tokenHash" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "SystemSetups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SystemSetups_singleton" CHECK ("id" = 1),
  CONSTRAINT "SystemSetups_attempts_nonnegative" CHECK ("failedAttempts" >= 0)
);
-- Existing installations must never become publicly claimable after upgrading.
INSERT INTO "SystemSetups" ("id", "completedAt")
VALUES (1, CASE WHEN EXISTS (SELECT 1 FROM "StaffMembers") THEN CURRENT_TIMESTAMP ELSE NULL END);

ALTER TYPE "AuditAction" ADD VALUE 'SYSTEM_SETUP_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPERADMIN_RECOVERED';

COMMIT;
