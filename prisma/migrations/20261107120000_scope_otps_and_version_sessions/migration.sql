-- Existing codes have no trustworthy purpose; require fresh codes after deployment.
CREATE TYPE "OtpPurpose" AS ENUM ('ONBOARDING', 'PASSWORD_CHANGE', 'PASSWORD_RESET', 'EMAIL_CHANGE');
DELETE FROM "OTPs";
DROP INDEX "OTPs_staffId_key";
ALTER TABLE "OTPs" ADD COLUMN "purpose" "OtpPurpose" NOT NULL,
                   ADD COLUMN "targetEmail" TEXT;
CREATE UNIQUE INDEX "OTPs_staffId_purpose_key" ON "OTPs"("staffId", "purpose");
ALTER TABLE "StaffMembers" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
