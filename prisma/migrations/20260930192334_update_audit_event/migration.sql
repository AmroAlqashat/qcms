/*
  Warnings:

  - You are about to drop the column `outcome` on the `AuditEvent` table. All the data in the column will be lost.
  - Added the required column `isSuccess` to the `AuditEvent` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `actionType` on the `AuditEvent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `targetType` on the `AuditEvent` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('STAFF_CREATED', 'STAFF_DELETED', 'STAFF_ROLE_ASSIGNED', 'STAFF_ROLE_REMOVED');

-- CreateEnum
CREATE TYPE "AuditTarget" AS ENUM ('STAFF', 'STUDENT', 'ROLE');

-- AlterTable
ALTER TABLE "AuditEvent" DROP COLUMN "outcome",
ADD COLUMN     "isSuccess" BOOLEAN NOT NULL,
ADD COLUMN     "roleName" TEXT,
DROP COLUMN "actionType",
ADD COLUMN     "actionType" "AuditAction" NOT NULL,
DROP COLUMN "targetType",
ADD COLUMN     "targetType" "AuditTarget" NOT NULL;

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");
