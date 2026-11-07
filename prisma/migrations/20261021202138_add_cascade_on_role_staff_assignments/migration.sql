-- DropForeignKey
ALTER TABLE "RoleStaffAssignments" DROP CONSTRAINT "RoleStaffAssignments_roleId_fkey";

-- AddForeignKey
ALTER TABLE "RoleStaffAssignments" ADD CONSTRAINT "RoleStaffAssignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
