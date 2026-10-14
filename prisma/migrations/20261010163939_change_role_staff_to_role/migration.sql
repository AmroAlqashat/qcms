/*
  Warnings:

  - You are about to drop the column `rolePermissionId` on the `RoleStaff` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[staffId,roleId]` on the table `RoleStaff` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `roleId` to the `RoleStaff` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RoleStaff" DROP CONSTRAINT "RoleStaff_rolePermissionId_fkey";

-- DropIndex
DROP INDEX "RoleStaff_staffId_rolePermissionId_key";

-- AlterTable
ALTER TABLE "RoleStaff" DROP COLUMN "rolePermissionId",
ADD COLUMN     "roleId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RoleStaff_staffId_roleId_key" ON "RoleStaff"("staffId", "roleId");

-- AddForeignKey
ALTER TABLE "RoleStaff" ADD CONSTRAINT "RoleStaff_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
