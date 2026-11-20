BEGIN;
CREATE TABLE "Guests" (
  "id" TEXT PRIMARY KEY,
  "fullName" TEXT NOT NULL,
  "guardianName" TEXT NOT NULL,
  "guardianPhone" VARCHAR(20) NOT NULL
);
ALTER TABLE "ActivityParticipants" ADD COLUMN "id" TEXT, ADD COLUMN "guestId" TEXT;
UPDATE "ActivityParticipants" SET "id" = gen_random_uuid()::text;
ALTER TABLE "ActivityParticipants" DROP CONSTRAINT "ActivityParticipants_pkey";
ALTER TABLE "ActivityParticipants"
  ADD CONSTRAINT "ActivityParticipants_pkey" PRIMARY KEY ("id"),
  ALTER COLUMN "studentId" DROP NOT NULL,
  ADD CONSTRAINT "ActivityParticipants_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ActivityParticipants_exactly_one_person" CHECK (num_nonnulls("studentId","guestId") = 1);
CREATE UNIQUE INDEX "ActivityParticipants_activityId_studentId_key" ON "ActivityParticipants"("activityId","studentId");
CREATE UNIQUE INDEX "ActivityParticipants_activityId_guestId_key" ON "ActivityParticipants"("activityId","guestId");
COMMIT;
