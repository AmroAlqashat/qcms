BEGIN;

CREATE TYPE "TermType" AS ENUM ('STANDARD', 'CONTINUOUS');
ALTER TYPE "AuditAction" ADD VALUE 'TERM_CREATED';
ALTER TYPE "AuditTarget" ADD VALUE 'TERM';

-- Existing dated terms are standard; new terms must explicitly supply a type.
ALTER TABLE "Terms" ADD COLUMN "type" "TermType" NOT NULL DEFAULT 'STANDARD',
ALTER COLUMN "startDate" DROP NOT NULL,
ALTER COLUMN "endDate" DROP NOT NULL;
ALTER TABLE "Terms" ALTER COLUMN "type" DROP DEFAULT;

COMMIT;
