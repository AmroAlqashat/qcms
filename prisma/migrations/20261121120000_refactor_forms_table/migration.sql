BEGIN;

-- The previous UI never scheduled openings. Protect any manually scheduled ones.
DO $$ BEGIN
  IF EXISTS (SELECT FROM "Forms" WHERE "kind" = 'ACTIVITY_APPLICATION' AND "enabled" AND "opensAt" > CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Resolve future activity registration opening dates before migrating';
  END IF;
END $$;

CREATE TABLE "ActivityFormDefinitions" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "form" JSONB NOT NULL
);

INSERT INTO "ActivityFormDefinitions" VALUES (
  'a1387869-0b48-4db5-be4c-68c18ace06e8', 'تسجيل طالب في نشاط',
  '{"display":"form","components":[
    {"type":"textfield","key":"firstName","label":"اسم الطالب الأول","input":true,"validate":{"required":true}},
    {"type":"textfield","key":"nationalId","label":"الرقم الوطني للطالب","input":true,"validate":{"required":true}},
    {"type":"datetime","key":"dateOfBirth","label":"تاريخ ميلاد الطالب","input":true,"enableTime":false,"format":"yyyy-MM-dd","validate":{"required":true}},
    {"type":"button","key":"submit","label":"تسجيل الطالب","action":"submit","theme":"primary","input":true}
  ]}'
);

-- The numbered choices had no stored questions. Keep the second choice independently editable.
INSERT INTO "ActivityFormDefinitions"
SELECT 'b1e51b99-6574-4922-9147-40915b990639', 'تسجيل طالب في نشاط (النموذج الثاني)', "form"
FROM "ActivityFormDefinitions" WHERE EXISTS (SELECT FROM "Forms" WHERE "template" = 2);

ALTER TABLE "Activities" ADD COLUMN "formId" TEXT,
  ADD COLUMN "isFormEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "formClosesAt" TIMESTAMP(3);

UPDATE "Activities" a SET
  "formId" = CASE WHEN f."template" = 2 THEN 'b1e51b99-6574-4922-9147-40915b990639' ELSE 'a1387869-0b48-4db5-be4c-68c18ace06e8' END,
  "isFormEnabled" = f."enabled", "formClosesAt" = f."closesAt"
FROM "Forms" f WHERE f."activityId" = a."id";
UPDATE "Activities" SET "formId" = 'a1387869-0b48-4db5-be4c-68c18ace06e8' WHERE "formId" IS NULL;
ALTER TABLE "Activities" ALTER COLUMN "formId" SET NOT NULL;

-- Preserve the effective center-wide switch if the two old copies diverged.
INSERT INTO "Settings" ("id", "key", "value", "setById")
SELECT gen_random_uuid()::text, 'registrationOpen', to_jsonb("enabled"), 'system'
FROM "Forms" WHERE "kind" = 'STUDENT_REGISTRATION' AND to_jsonb("enabled") IS DISTINCT FROM
  (SELECT "value" FROM "Settings" WHERE "key" = 'registrationOpen' ORDER BY "setAt" DESC, "id" DESC LIMIT 1)
  AND (EXISTS (SELECT FROM "Settings" WHERE "key" = 'registrationOpen') OR "enabled");

DROP TABLE "Forms";
DROP TYPE "FormKind";
ALTER TABLE "ActivityFormDefinitions" RENAME TO "Forms";
ALTER TABLE "Forms" RENAME CONSTRAINT "ActivityFormDefinitions_pkey" TO "Forms_pkey";
ALTER TABLE "Activities" ADD CONSTRAINT "Activities_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
