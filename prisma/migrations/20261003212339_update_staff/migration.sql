/*
  Warnings:

  - Added the required column `dateOfBirth` to the `Staff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mustChangePassword` to the `Staff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nationalId` to the `Staff` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `Staff` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StaffStatus" ADD VALUE 'PENDING';
ALTER TYPE "StaffStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "dateOfBirth" DATE NOT NULL,
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL,
ADD COLUMN     "nationalId" VARCHAR(30) NOT NULL,
ADD COLUMN     "phone" VARCHAR(20) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'INACTIVE';
