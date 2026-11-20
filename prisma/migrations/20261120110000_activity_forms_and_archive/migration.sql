-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT');

-- CreateEnum
CREATE TYPE "FormKind" AS ENUM ('STUDENT_REGISTRATION', 'ACTIVITY_APPLICATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ACTIVITY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ACTIVITY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ACTIVITY_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'ACTIVITY_REGISTRATION';
ALTER TYPE "AuditAction" ADD VALUE 'ACTIVITY_ATTENDANCE';

-- AlterEnum
ALTER TYPE "AuditTarget" ADD VALUE 'ACTIVITY';

-- AlterTable
ALTER TABLE "Halaqas" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Activities" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ActivityParticipants" ADD COLUMN     "attendanceStatus" "AttendanceStatus";

-- CreateTable
CREATE TABLE "Forms" (
    "id" TEXT NOT NULL,
    "kind" "FormKind" NOT NULL,
    "activityId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "template" INTEGER,

    CONSTRAINT "Forms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Forms_activityId_key" ON "Forms"("activityId");

-- AddForeignKey
ALTER TABLE "Forms" ADD CONSTRAINT "Forms_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Forms" ADD CHECK (("kind" = 'ACTIVITY_APPLICATION') = ("activityId" IS NOT NULL)),
 ADD CHECK ("template" IS NULL OR ("kind" = 'ACTIVITY_APPLICATION' AND "template" IN (1,2))),
 ADD CHECK ("opensAt" IS NULL OR "closesAt" IS NULL OR "opensAt" < "closesAt");
CREATE UNIQUE INDEX "Forms_one_student_registration" ON "Forms" ("kind") WHERE "kind" = 'STUDENT_REGISTRATION';
INSERT INTO "Forms" ("id","kind","enabled") VALUES ('student-registration','STUDENT_REGISTRATION',
 COALESCE((SELECT "value" = 'true'::jsonb FROM "Settings" WHERE "key"='registrationOpen' ORDER BY "setAt" DESC,"id" DESC LIMIT 1),false));
UPDATE "ActivityParticipants" SET "attendanceStatus"='PRESENT' WHERE "attendedAt" IS NOT NULL;
