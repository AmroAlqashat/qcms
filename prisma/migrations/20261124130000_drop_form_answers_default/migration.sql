-- The app always sends formAnswers; no database default.
ALTER TABLE "ActivityParticipants" ALTER COLUMN "formAnswers" DROP DEFAULT;
