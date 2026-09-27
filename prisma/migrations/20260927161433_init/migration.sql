-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('CENTRE_WIDE', 'ASSIGNED_CLASS', 'ASSIGNED_ACTIVITY', 'OWN_ACCOUNT');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('CENTRE_WIDE', 'HALAQA_SPECIFIC');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "allowedScopes" "ScopeType"[],

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "scopeType" "ScopeType" NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleStaff" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "rolePermissionId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RoleStaff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffClassAssignment" (
    "staffId" TEXT NOT NULL,
    "halaqaId" TEXT NOT NULL,

    CONSTRAINT "StaffClassAssignment_pkey" PRIMARY KEY ("staffId","halaqaId")
);

-- CreateTable
CREATE TABLE "StaffActivityAssignment" (
    "staffId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,

    CONSTRAINT "StaffActivityAssignment_pkey" PRIMARY KEY ("staffId","activityId")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actionType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Halaqa" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "meetingDays" JSONB NOT NULL,

    CONSTRAINT "Halaqa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "ActivityLevel" NOT NULL,
    "halaqaId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "halaqaId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HalaqaTransfer" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromHalaqaId" TEXT NOT NULL,
    "toHalaqaId" TEXT NOT NULL,
    "actingStaffId" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HalaqaTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityParticipant" (
    "studentId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "attendedAt" TIMESTAMP(3),

    CONSTRAINT "ActivityParticipant_pkey" PRIMARY KEY ("studentId","activityId")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "nationalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "primaryPhone" TEXT NOT NULL,
    "secondaryPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardianStudentLink" (
    "id" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,

    CONSTRAINT "GuardianStudentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermRegistration" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,

    CONSTRAINT "TermRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialCaseNote" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpecialCaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "setById" TEXT NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_resource_action_key" ON "Permission"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_scopeType_key" ON "RolePermission"("roleId", "permissionId", "scopeType");

-- CreateIndex
CREATE UNIQUE INDEX "RoleStaff_staffId_rolePermissionId_key" ON "RoleStaff"("staffId", "rolePermissionId");

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_nationalId_key" ON "Student"("nationalId");

-- CreateIndex
CREATE UNIQUE INDEX "TermRegistration_studentId_termId_key" ON "TermRegistration"("studentId", "termId");

-- CreateIndex
CREATE INDEX "Setting_key_setAt_idx" ON "Setting"("key", "setAt");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleStaff" ADD CONSTRAINT "RoleStaff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleStaff" ADD CONSTRAINT "RoleStaff_rolePermissionId_fkey" FOREIGN KEY ("rolePermissionId") REFERENCES "RolePermission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClassAssignment" ADD CONSTRAINT "StaffClassAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClassAssignment" ADD CONSTRAINT "StaffClassAssignment_halaqaId_fkey" FOREIGN KEY ("halaqaId") REFERENCES "Halaqa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffActivityAssignment" ADD CONSTRAINT "StaffActivityAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffActivityAssignment" ADD CONSTRAINT "StaffActivityAssignment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Halaqa" ADD CONSTRAINT "Halaqa_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_halaqaId_fkey" FOREIGN KEY ("halaqaId") REFERENCES "Halaqa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_halaqaId_fkey" FOREIGN KEY ("halaqaId") REFERENCES "Halaqa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HalaqaTransfer" ADD CONSTRAINT "HalaqaTransfer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HalaqaTransfer" ADD CONSTRAINT "HalaqaTransfer_fromHalaqaId_fkey" FOREIGN KEY ("fromHalaqaId") REFERENCES "Halaqa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HalaqaTransfer" ADD CONSTRAINT "HalaqaTransfer_toHalaqaId_fkey" FOREIGN KEY ("toHalaqaId") REFERENCES "Halaqa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityParticipant" ADD CONSTRAINT "ActivityParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityParticipant" ADD CONSTRAINT "ActivityParticipant_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianStudentLink" ADD CONSTRAINT "GuardianStudentLink_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuardianStudentLink" ADD CONSTRAINT "GuardianStudentLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermRegistration" ADD CONSTRAINT "TermRegistration_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermRegistration" ADD CONSTRAINT "TermRegistration_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialCaseNote" ADD CONSTRAINT "SpecialCaseNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
