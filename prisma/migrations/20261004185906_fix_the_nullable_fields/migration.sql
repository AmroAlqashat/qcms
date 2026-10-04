/*
  Warnings:

  - Made the column `jobTitle` on table `Staff` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Staff" ALTER COLUMN "jobTitle" SET NOT NULL,
ALTER COLUMN "dateOfBirth" DROP NOT NULL,
ALTER COLUMN "nationalId" DROP NOT NULL,
ALTER COLUMN "phone" DROP NOT NULL;
