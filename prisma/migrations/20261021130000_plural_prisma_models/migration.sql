-- Models now use the existing plural table names directly.
-- Removing the explicit OTP relation mapping only renames its constraint.
BEGIN;
-- RenameForeignKey
ALTER TABLE "OTPs" RENAME CONSTRAINT "otp_staff_frk" TO "OTPs_staffId_fkey";

COMMIT;
