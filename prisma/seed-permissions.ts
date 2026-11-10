import { config } from 'dotenv';
import { actionKeys, resourceKeys } from './permission-catalog-labels';
import { Prisma, PrismaClient, ScopeType } from '@prisma/client';

// From the QCMS permission catalog. The compact scopes are expanded below:
// C = CENTER_WIDE, H = ASSIGNED_CLASS, O = OWN_ACCOUNT.
// Keep resource/action labels aligned with the names used by your authorization checks.
const permissionCatalog = [
  { resource: 'الطلاب', action: 'عرض', category: 'الطلاب', scopes: 'CH' },
  { resource: 'الطلاب', action: 'تعديل', category: 'الطلاب', scopes: 'CH' },
  {
    resource: 'الطلاب',
    action: 'تسكين في حلقة',
    category: 'الطلاب',
    scopes: 'CH',
  },
  {
    resource: 'الطلاب',
    action: 'سحب من المركز',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'الحالات الخاصة',
    action: 'عرض',
    category: 'الطلاب',
    scopes: 'CH',
  },
  {
    resource: 'الحالات الخاصة',
    action: 'إضافة',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'الحالات الخاصة',
    action: 'تعديل',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'بيانات أولياء الأمور',
    action: 'عرض',
    category: 'الطلاب',
    scopes: 'CH',
  },
  {
    resource: 'بيانات أولياء الأمور',
    action: 'إضافة ولي أمر',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'بيانات أولياء الأمور',
    action: 'تعديل',
    category: 'الطلاب',
    scopes: 'CH',
  },
  {
    resource: 'بيانات أولياء الأمور',
    action: 'ربط ولي أمر موجود',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'بيانات أولياء الأمور',
    action: 'فك ربط ولي الأمر',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'التكرارات المحتملة',
    action: 'عرض',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'التكرارات المحتملة',
    action: 'معالجة',
    category: 'الطلاب',
    scopes: 'C',
  },
  { resource: 'رابط التسجيل', action: 'عرض', category: 'الطلاب', scopes: 'C' },
  { resource: 'رابط التسجيل', action: 'فتح', category: 'الطلاب', scopes: 'C' },
  {
    resource: 'رابط التسجيل',
    action: 'إغلاق',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'رابط التسجيل',
    action: 'تعديل نص التنبيه',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'تسجيلات الفصول',
    action: 'عرض',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'تسجيلات الفصول',
    action: 'قبول',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'تسجيلات الفصول',
    action: 'رفض',
    category: 'الطلاب',
    scopes: 'C',
  },
  { resource: 'طلبات العضوية', action: 'عرض', category: 'الطلاب', scopes: 'C' },
  {
    resource: 'طلبات العضوية',
    action: 'قبول',
    category: 'الطلاب',
    scopes: 'C',
  },
  { resource: 'طلبات العضوية', action: 'رفض', category: 'الطلاب', scopes: 'C' },
  {
    resource: 'الفصول الدراسية',
    action: 'عرض',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الفصول الدراسية',
    action: 'إنشاء',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الفصول الدراسية',
    action: 'تعديل',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الفصول الدراسية',
    action: 'أرشفة',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الحلقات',
    action: 'عرض',
    category: 'الحلقات والأنشطة',
    scopes: 'CH',
  },
  {
    resource: 'الحلقات',
    action: 'إنشاء',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الحلقات',
    action: 'تعديل',
    category: 'الحلقات والأنشطة',
    scopes: 'CH',
  },
  {
    resource: 'الحلقات',
    action: 'تعيين معلم',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الحلقات',
    action: 'إضافة طالب',
    category: 'الحلقات والأنشطة',
    scopes: 'CH',
  },
  {
    resource: 'الحلقات',
    action: 'إخراج طالب',
    category: 'الحلقات والأنشطة',
    scopes: 'CH',
  },
  {
    resource: 'الحلقات',
    action: 'نقل طالب',
    category: 'الحلقات والأنشطة',
    scopes: 'CH',
  },
  {
    resource: 'الحلقات',
    action: 'ترحيل القائمة',
    category: 'الحلقات والأنشطة',
    scopes: 'CH',
  },
  {
    resource: 'الحلقات',
    action: 'تصدير التقرير اليومي',
    category: 'الحلقات والأنشطة',
    scopes: 'CH',
  },
  {
    resource: 'الأنشطة',
    action: 'عرض',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الأنشطة',
    action: 'إنشاء',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الأنشطة',
    action: 'تعديل',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الأنشطة',
    action: 'تعيين معلم',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الأنشطة',
    action: 'تسجيل طالب أو حلقة',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الأنشطة',
    action: 'إلغاء تسجيل مشارك',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الأنشطة',
    action: 'أرشفة',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'التقويم',
    action: 'عرض',
    category: 'الحلقات والأنشطة',
    scopes: 'CH',
  },
  {
    resource: 'تفويض الوصول',
    action: 'إنشاء',
    category: 'الحلقات والأنشطة',
    scopes: 'H',
  },
  {
    resource: 'تفويض الوصول',
    action: 'سحب',
    category: 'الحلقات والأنشطة',
    scopes: 'H',
  },
  {
    resource: 'طلبات التفويض',
    action: 'عرض',
    category: 'الحلقات والأنشطة',
    scopes: 'H',
  },
  {
    resource: 'طلبات التفويض',
    action: 'اعتماد',
    category: 'الحلقات والأنشطة',
    scopes: 'H',
  },
  {
    resource: 'طلبات التفويض',
    action: 'رفض',
    category: 'الحلقات والأنشطة',
    scopes: 'H',
  },
  { resource: 'الحضور', action: 'عرض', category: 'الحضور', scopes: 'CH' },
  { resource: 'الحضور', action: 'تسجيل', category: 'الحضور', scopes: 'CH' },
  { resource: 'الحضور', action: 'تعديل', category: 'الحضور', scopes: 'CH' },
  { resource: 'الحفظ', action: 'عرض', category: 'التسميع', scopes: 'CH' },
  { resource: 'الحفظ', action: 'تسجيل', category: 'التسميع', scopes: 'CH' },
  {
    resource: 'الحفظ',
    action: 'تعليم كمراجَع',
    category: 'التسميع',
    scopes: 'CH',
  },
  { resource: 'خطة الحفظ', action: 'عرض', category: 'التسميع', scopes: 'CH' },
  { resource: 'خطة الحفظ', action: 'إنشاء', category: 'التسميع', scopes: 'CH' },
  { resource: 'خطة الحفظ', action: 'تعديل', category: 'التسميع', scopes: 'CH' },
  {
    resource: 'جلسات التسميع',
    action: 'عرض',
    category: 'التسميع',
    scopes: 'CH',
  },
  {
    resource: 'جلسات التسميع',
    action: 'بدء جلسة',
    category: 'التسميع',
    scopes: 'CH',
  },
  {
    resource: 'جلسات التسميع',
    action: 'تقييم صفحة',
    category: 'التسميع',
    scopes: 'CH',
  },
  {
    resource: 'جلسات التسميع',
    action: 'إعادة',
    category: 'التسميع',
    scopes: 'CH',
  },
  {
    resource: 'الاختبارات',
    action: 'عرض',
    category: 'اختبارات الأجزاء',
    scopes: 'CH',
  },
  {
    resource: 'الاختبارات',
    action: 'جدولة',
    category: 'اختبارات الأجزاء',
    scopes: 'CH',
  },
  {
    resource: 'الاختبارات',
    action: 'إعادة جدولة',
    category: 'اختبارات الأجزاء',
    scopes: 'CH',
  },
  {
    resource: 'الاختبارات',
    action: 'إلغاء',
    category: 'اختبارات الأجزاء',
    scopes: 'CH',
  },
  {
    resource: 'الاختبارات',
    action: 'تعيين مختبِر',
    category: 'اختبارات الأجزاء',
    scopes: 'C',
  },
  {
    resource: 'الاختبارات',
    action: 'إجراء',
    category: 'اختبارات الأجزاء',
    scopes: 'CH',
  },
  {
    resource: 'الاختبارات',
    action: 'تسجيل النتيجة',
    category: 'اختبارات الأجزاء',
    scopes: 'CH',
  },
  {
    resource: 'الشهادات',
    action: 'عرض',
    category: 'اختبارات الأجزاء',
    scopes: 'C',
  },
  {
    resource: 'الشهادات',
    action: 'إصدار',
    category: 'اختبارات الأجزاء',
    scopes: 'C',
  },
  {
    resource: 'النقاط',
    action: 'عرض',
    category: 'اختبارات الأجزاء',
    scopes: 'CH',
  },
  { resource: 'المدفوعات', action: 'عرض', category: 'المالية', scopes: 'C' },
  { resource: 'المدفوعات', action: 'تسجيل', category: 'المالية', scopes: 'C' },
  { resource: 'المدفوعات', action: 'عكس', category: 'المالية', scopes: 'C' },
  { resource: 'المصروفات', action: 'عرض', category: 'المالية', scopes: 'C' },
  { resource: 'المصروفات', action: 'تسجيل', category: 'المالية', scopes: 'C' },
  { resource: 'المصروفات', action: 'عكس', category: 'المالية', scopes: 'C' },
  { resource: 'الرسوم', action: 'عرض', category: 'المالية', scopes: 'C' },
  { resource: 'الرسوم', action: 'إضافة', category: 'المالية', scopes: 'C' },
  { resource: 'الرسوم', action: 'إسقاط', category: 'المالية', scopes: 'C' },
  { resource: 'الرسوم', action: 'عكس', category: 'المالية', scopes: 'C' },
  {
    resource: 'الخصومات والإعفاءات',
    action: 'عرض',
    category: 'المالية',
    scopes: 'C',
  },
  {
    resource: 'الخصومات والإعفاءات',
    action: 'إضافة',
    category: 'المالية',
    scopes: 'C',
  },
  {
    resource: 'الخصومات والإعفاءات',
    action: 'اعتماد',
    category: 'المالية',
    scopes: 'C',
  },
  {
    resource: 'الخصومات والإعفاءات',
    action: 'مراجعة',
    category: 'المالية',
    scopes: 'C',
  },
  { resource: 'الأرصدة', action: 'عرض', category: 'المالية', scopes: 'C' },
  {
    resource: 'قائمة المتأخرات',
    action: 'عرض',
    category: 'المالية',
    scopes: 'C',
  },
  {
    resource: 'التقارير المالية',
    action: 'عرض',
    category: 'المالية',
    scopes: 'C',
  },
  {
    resource: 'التقارير المالية',
    action: 'تصدير',
    category: 'المالية',
    scopes: 'C',
  },
  {
    resource: 'الموظفون',
    action: 'عرض',
    category: 'الموظفون والصلاحيات',
    scopes: 'CO',
  },
  {
    resource: 'الموظفون',
    action: 'دعوة',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'الموظفون',
    action: 'تعديل',
    category: 'الموظفون والصلاحيات',
    scopes: 'CO',
  },
  {
    resource: 'الموظفون',
    action: 'إيقاف',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'الموظفون',
    action: 'إعادة تفعيل',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'الموظفون',
    action: 'حذف',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'تعيينات الموظفين',
    action: 'عرض',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'قوالب الصلاحيات',
    action: 'عرض',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'قوالب الصلاحيات',
    action: 'إنشاء',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'قوالب الصلاحيات',
    action: 'تعديل',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'قوالب الصلاحيات',
    action: 'حذف',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'قوالب الصلاحيات',
    action: 'إسناد لموظف',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'قوالب الصلاحيات',
    action: 'إلغاء الإسناد',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'المنح المباشرة',
    action: 'عرض',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'المنح المباشرة',
    action: 'منح',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'المنح المباشرة',
    action: 'سحب',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'الصلاحيات الفعلية',
    action: 'عرض',
    category: 'الموظفون والصلاحيات',
    scopes: 'CO',
  },
  {
    resource: 'سجل تغييرات الصلاحيات',
    action: 'عرض',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'استيراد البيانات',
    action: 'عرض',
    category: 'استيراد البيانات',
    scopes: 'C',
  },
  {
    resource: 'استيراد البيانات',
    action: 'رفع ملف',
    category: 'استيراد البيانات',
    scopes: 'C',
  },
  {
    resource: 'استيراد البيانات',
    action: 'تنزيل تقرير الأخطاء',
    category: 'استيراد البيانات',
    scopes: 'C',
  },
  { resource: 'التقارير', action: 'عرض', category: 'التقارير', scopes: 'CH' },
  {
    resource: 'التقارير',
    action: 'تصدير',
    category: 'التقارير',
    scopes: 'CH',
  },
  {
    resource: 'التقرير اليومي للمركز',
    action: 'عرض',
    category: 'التقارير',
    scopes: 'C',
  },
  {
    resource: 'التقرير اليومي للمركز',
    action: 'تصدير',
    category: 'التقارير',
    scopes: 'C',
  },
  {
    resource: 'التقرير اليومي للمركز',
    action: 'تعديل الصياغة',
    category: 'التقارير',
    scopes: 'C',
  },
  {
    resource: 'سجل التدقيق',
    action: 'عرض',
    category: 'السجل والأرشيف',
    scopes: 'C',
  },
  {
    resource: 'الأرشيف',
    action: 'عرض',
    category: 'السجل والأرشيف',
    scopes: 'CH',
  },
  {
    resource: 'النسخ الاحتياطية',
    action: 'عرض',
    category: 'السجل والأرشيف',
    scopes: 'C',
  },
  {
    resource: 'النسخ الاحتياطية',
    action: 'استعادة',
    category: 'السجل والأرشيف',
    scopes: 'C',
  },
  {
    resource: 'عمليات الاحتفاظ',
    action: 'عرض',
    category: 'السجل والأرشيف',
    scopes: 'C',
  },
  { resource: 'الإعدادات', action: 'عرض', category: 'الإعدادات', scopes: 'C' },
  {
    resource: 'الإعدادات',
    action: 'تعديل',
    category: 'الإعدادات',
    scopes: 'C',
  },
  {
    resource: 'إشعارات الموظفين',
    action: 'عرض',
    category: 'الإشعارات',
    scopes: 'CHO',
  },
  {
    resource: 'إشعارات الموظفين',
    action: 'تعليم كمنجز',
    category: 'الإشعارات',
    scopes: 'O',
  },
  {
    resource: 'إشعارات الموظفين',
    action: 'نشر إعلان',
    category: 'الإشعارات',
    scopes: 'C',
  },
] as const;

const scopeByCode: Record<string, ScopeType> = {
  C: ScopeType.CENTER_WIDE,
  H: ScopeType.ASSIGNED_CLASS,
  O: ScopeType.OWN_ACCOUNT,
};

export async function seedPermissions(tx: Prisma.TransactionClient) {
  const resources = new Map<string, string>();
  const actions = new Map<string, string>();

  for (const item of permissionCatalog) {
    if (!resources.has(item.resource)) {
      const engName = resourceKeys[item.resource];
      if (!engName) throw new Error('Missing permission resource key');
      const resource = await tx.permission_resources.upsert({
        where: { eng_name: engName },
        update: { arb_name: item.resource },
        create: { eng_name: engName, arb_name: item.resource },
        select: { id: true },
      });
      resources.set(item.resource, resource.id);
    }
    if (!actions.has(item.action)) {
      const engName = actionKeys[item.action];
      if (!engName) throw new Error('Missing permission action key');
      const action = await tx.permission_actions.upsert({
        where: { eng_name: engName },
        update: { arb_name: item.action },
        create: { eng_name: engName, arb_name: item.action },
        select: { id: true },
      });
      actions.set(item.action, action.id);
    }

    const resource = resources.get(item.resource)!;
    const action = actions.get(item.action)!;
    const allowedScopes = [...item.scopes].map((code) => scopeByCode[code]);
    await tx.permissions.upsert({
      where: { resource_action: { resource, action } },
      update: { category: item.category, allowedScopes },
      create: { resource, action, category: item.category, allowedScopes },
    });
  }

  return permissionCatalog.length;
}

// Importing this file only exposes the seed function; CLI execution owns its client.
if (require.main === module) {
  config();
  const prisma = new PrismaClient();
  prisma
    .$transaction((tx) => seedPermissions(tx), { timeout: 30_000 })
    .then((count) => console.log(`Seeded ${count} permissions.`))
    .catch(() => {
      console.error(
        'Permission seed failed. Check the connection and migrations.',
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
