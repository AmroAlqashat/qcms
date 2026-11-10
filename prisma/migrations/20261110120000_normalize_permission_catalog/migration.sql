BEGIN;

-- Existing permissions retain their IDs and all surviving grant references.
CREATE TABLE "permission_actions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eng_name" TEXT NOT NULL,
  "arb_name" TEXT NOT NULL
);
CREATE TABLE "permission_resources" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eng_name" TEXT NOT NULL,
  "arb_name" TEXT NOT NULL
);
CREATE UNIQUE INDEX "action_eng_name_unique" ON "permission_actions"("eng_name");
CREATE UNIQUE INDEX "resource_eng_name_unique" ON "permission_resources"("eng_name");

WITH labels(arb_name, eng_name) AS (
  VALUES
    ('الطلاب', 'students'),
    ('الحالات الخاصة', 'special_cases'),
    ('بيانات أولياء الأمور', 'guardian_details'),
    ('التكرارات المحتملة', 'potential_duplicates'),
    ('رابط التسجيل', 'registration_link'),
    ('تسجيلات الفصول', 'term_registrations'),
    ('طلبات العضوية', 'membership_requests'),
    ('الفصول الدراسية', 'terms'),
    ('الحلقات', 'halaqas'),
    ('الأنشطة', 'activities'),
    ('التقويم', 'calendar'),
    ('تفويض الوصول', 'access_delegations'),
    ('طلبات التفويض', 'delegation_requests'),
    ('الحضور', 'attendance'),
    ('الحفظ', 'memorization'),
    ('خطة الحفظ', 'memorization_plan'),
    ('جلسات التسميع', 'recitation_sessions'),
    ('الاختبارات', 'exams'),
    ('الشهادات', 'certificates'),
    ('النقاط', 'points'),
    ('المدفوعات', 'payments'),
    ('المصروفات', 'expenses'),
    ('الرسوم', 'fees'),
    ('الخصومات والإعفاءات', 'discounts_and_exemptions'),
    ('الأرصدة', 'balances'),
    ('قائمة المتأخرات', 'arrears'),
    ('التقارير المالية', 'financial_reports'),
    ('الموظفون', 'staff'),
    ('تعيينات الموظفين', 'staff_assignments'),
    ('قوالب الصلاحيات', 'roles'),
    ('المنح المباشرة', 'direct_grants'),
    ('الصلاحيات الفعلية', 'effective_permissions'),
    ('سجل تغييرات الصلاحيات', 'permission_change_history'),
    ('استيراد البيانات', 'data_import'),
    ('التقارير', 'reports'),
    ('التقرير اليومي للمركز', 'center_daily_report'),
    ('سجل التدقيق', 'audit_log'),
    ('الأرشيف', 'archive'),
    ('النسخ الاحتياطية', 'backups'),
    ('عمليات الاحتفاظ', 'retention_operations'),
    ('الإعدادات', 'settings'),
    ('إشعارات الموظفين', 'staff_notifications')
)
INSERT INTO "permission_resources" ("id", "eng_name", "arb_name")
SELECT gen_random_uuid()::text,
       COALESCE(labels.eng_name, 'legacy_' || md5(existing.name)),
       existing.name
FROM (SELECT DISTINCT "resource" AS name FROM "Permissions") existing
LEFT JOIN labels ON labels.arb_name = existing.name;

UPDATE "Permissions" p SET "resource" = catalog."id"
FROM "permission_resources" catalog WHERE p."resource" = catalog."arb_name";

WITH labels(arb_name, eng_name) AS (
  VALUES
    ('عرض', 'read'),
    ('تعديل', 'edit'),
    ('تسكين في حلقة', 'assign_to_halaqa'),
    ('سحب من المركز', 'withdraw_from_center'),
    ('إضافة', 'add'),
    ('إضافة ولي أمر', 'add_guardian'),
    ('ربط ولي أمر موجود', 'link_existing_guardian'),
    ('فك ربط ولي الأمر', 'unlink_guardian'),
    ('معالجة', 'process'),
    ('فتح', 'open'),
    ('إغلاق', 'close'),
    ('تعديل نص التنبيه', 'edit_notice'),
    ('قبول', 'approve'),
    ('رفض', 'reject'),
    ('إنشاء', 'create'),
    ('أرشفة', 'archive'),
    ('تعيين معلم', 'assign_teacher'),
    ('إضافة طالب', 'add_student'),
    ('إخراج طالب', 'remove_student'),
    ('نقل طالب', 'transfer_student'),
    ('ترحيل القائمة', 'carry_over_roster'),
    ('تصدير التقرير اليومي', 'export_daily_report'),
    ('تسجيل طالب أو حلقة', 'register_student_or_halaqa'),
    ('إلغاء تسجيل مشارك', 'unregister_participant'),
    ('سحب', 'withdraw'),
    ('اعتماد', 'authorize'),
    ('تسجيل', 'record'),
    ('تعليم كمراجَع', 'mark_reviewed'),
    ('بدء جلسة', 'start_session'),
    ('تقييم صفحة', 'evaluate_page'),
    ('إعادة', 'repeat'),
    ('جدولة', 'schedule'),
    ('إعادة جدولة', 'reschedule'),
    ('إلغاء', 'cancel'),
    ('تعيين مختبِر', 'assign_examiner'),
    ('إجراء', 'conduct'),
    ('تسجيل النتيجة', 'record_result'),
    ('إصدار', 'issue'),
    ('عكس', 'reverse'),
    ('إسقاط', 'waive'),
    ('مراجعة', 'review'),
    ('تصدير', 'export'),
    ('دعوة', 'invite'),
    ('إيقاف', 'deactivate'),
    ('إعادة تفعيل', 'reactivate'),
    ('حذف', 'delete'),
    ('إسناد لموظف', 'assign_to_staff'),
    ('إلغاء الإسناد', 'unassign'),
    ('منح', 'grant'),
    ('رفع ملف', 'upload_file'),
    ('تنزيل تقرير الأخطاء', 'download_error_report'),
    ('تعديل الصياغة', 'edit_wording'),
    ('استعادة', 'restore'),
    ('تعليم كمنجز', 'mark_done'),
    ('نشر إعلان', 'publish_announcement')
)
INSERT INTO "permission_actions" ("id", "eng_name", "arb_name")
SELECT gen_random_uuid()::text,
       COALESCE(labels.eng_name, 'legacy_' || md5(existing.name)),
       existing.name
FROM (SELECT DISTINCT "action" AS name FROM "Permissions") existing
LEFT JOIN labels ON labels.arb_name = existing.name;

UPDATE "Permissions" p SET "action" = catalog."id"
FROM "permission_actions" catalog WHERE p."action" = catalog."arb_name";

-- Remove the retired scope without expanding anyone's access.
DELETE FROM "DirectPermissionGrants" WHERE "scopeType"::text = 'ASSIGNED_ACTIVITY';
UPDATE "Permissions"
SET "allowedScopes" = array_remove("allowedScopes", 'ASSIGNED_ACTIVITY'::"ScopeType")
WHERE 'ASSIGNED_ACTIVITY'::"ScopeType" = ANY("allowedScopes");

-- Do not silently remove role grants if another installation still uses this scope.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "RolePermissions" WHERE "scopeType"::text = 'ASSIGNED_ACTIVITY') THEN
    RAISE EXCEPTION 'Retire ASSIGNED_ACTIVITY role grants before applying this migration';
  END IF;
END $$;
CREATE TYPE "ScopeType_new" AS ENUM ('CENTER_WIDE', 'ASSIGNED_CLASS', 'OWN_ACCOUNT');
ALTER TABLE "Permissions" ALTER COLUMN "allowedScopes" TYPE "ScopeType_new"[] USING ("allowedScopes"::text::"ScopeType_new"[]);
ALTER TABLE "DirectPermissionGrants" ALTER COLUMN "scopeType" TYPE "ScopeType_new" USING ("scopeType"::text::"ScopeType_new");
ALTER TABLE "RolePermissions" ALTER COLUMN "scopeType" TYPE "ScopeType_new" USING ("scopeType"::text::"ScopeType_new");
ALTER TYPE "ScopeType" RENAME TO "ScopeType_old";
ALTER TYPE "ScopeType_new" RENAME TO "ScopeType";
DROP TYPE "ScopeType_old";

ALTER TABLE "Permissions" ADD CONSTRAINT "action_permission_frk" FOREIGN KEY ("action") REFERENCES "permission_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Permissions" ADD CONSTRAINT "resource_permission_frk" FOREIGN KEY ("resource") REFERENCES "permission_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER INDEX "Permissions_resource_action_key" RENAME TO "resource_action_unique_key";

DROP INDEX "Permissions_id_idx";
DROP INDEX "RolePermissions_id_idx";
DROP INDEX "Roles_id_idx";
DROP INDEX "StaffMembers_id_idx";
DROP INDEX "Settings_key_setAt_idx";
CREATE INDEX "RoleStaffAssignments_roleId_revokedAt_idx" ON "RoleStaffAssignments"("roleId", "revokedAt");
CREATE INDEX "Settings_key_setAt_id_idx" ON "Settings"("key", "setAt", "id");
CREATE INDEX "StaffActivityAssignments_activityId_endedAt_idx" ON "StaffActivityAssignments"("activityId", "endedAt");
CREATE INDEX "StaffClassAssignments_halaqaId_endedAt_idx" ON "StaffClassAssignments"("halaqaId", "endedAt");
CREATE INDEX "StaffMembers_isDeleted_createdAt_idx" ON "StaffMembers"("isDeleted", "createdAt");

COMMIT;
