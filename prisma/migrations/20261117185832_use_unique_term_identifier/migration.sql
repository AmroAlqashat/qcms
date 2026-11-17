BEGIN;

-- Preserve the existing column and term relationships rather than dropping data.
ALTER TABLE "Terms" RENAME COLUMN "name" TO "termId";
ALTER TABLE "Terms" ALTER COLUMN "termId" TYPE VARCHAR(5);

CREATE UNIQUE INDEX "Terms_termId_key" ON "Terms"("termId");

COMMIT;
