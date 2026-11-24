-- Answers to the activity's form. Existing participants get '{}'.
ALTER TABLE "ActivityParticipants" ADD COLUMN "formAnswers" JSONB NOT NULL DEFAULT '{}';
