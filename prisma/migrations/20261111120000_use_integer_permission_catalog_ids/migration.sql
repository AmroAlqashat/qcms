BEGIN;

-- Keep permission IDs and grant history intact while replacing catalog identifiers.
LOCK TABLE "Permissions", "permission_actions", "permission_resources" IN ACCESS EXCLUSIVE MODE;

CREATE SEQUENCE "permission_actions_id_seq" AS INTEGER;
CREATE SEQUENCE "permission_resources_id_seq" AS INTEGER;
ALTER TABLE "permission_actions" ADD COLUMN "new_id" INTEGER NOT NULL DEFAULT nextval('"permission_actions_id_seq"');
ALTER TABLE "permission_resources" ADD COLUMN "new_id" INTEGER NOT NULL DEFAULT nextval('"permission_resources_id_seq"');

ALTER TABLE "Permissions" DROP CONSTRAINT "action_permission_frk";
ALTER TABLE "Permissions" DROP CONSTRAINT "resource_permission_frk";

UPDATE "Permissions" p SET "action" = catalog."new_id"::text
FROM "permission_actions" catalog WHERE p."action" = catalog."id";
UPDATE "Permissions" p SET "resource" = catalog."new_id"::text
FROM "permission_resources" catalog WHERE p."resource" = catalog."id";

ALTER TABLE "Permissions" ALTER COLUMN "action" TYPE INTEGER USING "action"::integer;
ALTER TABLE "Permissions" ALTER COLUMN "resource" TYPE INTEGER USING "resource"::integer;
ALTER TABLE "permission_actions" ALTER COLUMN "id" TYPE INTEGER USING "new_id";
ALTER TABLE "permission_resources" ALTER COLUMN "id" TYPE INTEGER USING "new_id";

ALTER TABLE "permission_actions" ALTER COLUMN "id" SET DEFAULT nextval('"permission_actions_id_seq"');
ALTER TABLE "permission_resources" ALTER COLUMN "id" SET DEFAULT nextval('"permission_resources_id_seq"');
ALTER SEQUENCE "permission_actions_id_seq" OWNED BY "permission_actions"."id";
ALTER SEQUENCE "permission_resources_id_seq" OWNED BY "permission_resources"."id";
ALTER TABLE "permission_actions" DROP COLUMN "new_id";
ALTER TABLE "permission_resources" DROP COLUMN "new_id";

ALTER TABLE "Permissions" ADD CONSTRAINT "action_permission_frk" FOREIGN KEY ("action") REFERENCES "permission_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Permissions" ADD CONSTRAINT "resource_permission_frk" FOREIGN KEY ("resource") REFERENCES "permission_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
