import { config } from 'dotenv';
import { actionKeys, resourceKeys } from './permission-catalog-labels';
import { Prisma, PrismaClient, ScopeType } from '@prisma/client';

// C = CENTER_WIDE, H = ASSIGNED_CLASS, O = OWN_ACCOUNT.
const crudActions = [
  { action: 'إنشاء', key: 'create' },
  { action: 'عرض', key: 'read' },
  { action: 'تحديث', key: 'update' },
  { action: 'حذف', key: 'delete' },
] as const;

type CrudActionKey = (typeof crudActions)[number]['key'];

type PermissionResourceDefinition = {
  resource: string;
  category: string;
  scopes: string;
  scopeOverrides?: Partial<Record<CrudActionKey, string>>;
};

const permissionResources: readonly PermissionResourceDefinition[] = [
  {
    resource: 'الموظفون',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
    scopeOverrides: { read: 'CO', update: 'CO' },
  },
  {
    resource: 'الصلاحيات',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'المنح المباشرة',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'قوالب الصلاحيات',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'صلاحيات الأدوار',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'إسنادات الأدوار للموظفين',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'تعيينات الفصول للموظفين',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'تعيينات الأنشطة للموظفين',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'سجل التدقيق',
    category: 'السجل والأرشيف',
    scopes: 'C',
  },
  {
    resource: 'الفصول الدراسية',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'الحلقات',
    category: 'الحلقات والأنشطة',
    scopes: 'CH',
  },
  {
    resource: 'الأنشطة',
    category: 'الحلقات والأنشطة',
    scopes: 'C',
  },
  {
    resource: 'تسجيلات الطلاب',
    category: 'الطلاب',
    scopes: 'CH',
  },
  {
    resource: 'نقل الطلاب بين الحلقات',
    category: 'الطلاب',
    scopes: 'CH',
  },
  {
    resource: 'مشاركو الأنشطة',
    category: 'الحلقات والأنشطة',
    scopes: 'CH',
  },
  {
    resource: 'الطلاب',
    category: 'الطلاب',
    scopes: 'CH',
  },
  {
    resource: 'أولياء الأمور',
    category: 'الطلاب',
    scopes: 'CH',
  },
  {
    resource: 'روابط الطلاب بأولياء الأمور',
    category: 'الطلاب',
    scopes: 'CH',
  },
  {
    resource: 'تسجيلات الفصول',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'الحالات الخاصة',
    category: 'الطلاب',
    scopes: 'C',
  },
  {
    resource: 'الإعدادات',
    category: 'الإعدادات',
    scopes: 'C',
  },
  {
    resource: 'رموز التحقق',
    category: 'الأمان',
    scopes: 'C',
  },
  {
    resource: 'الجلسات',
    category: 'الأمان',
    scopes: 'C',
  },
  {
    resource: 'تهيئة النظام',
    category: 'الإعدادات',
    scopes: 'C',
  },
  {
    resource: 'إجراءات الصلاحيات',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
  {
    resource: 'موارد الصلاحيات',
    category: 'الموظفون والصلاحيات',
    scopes: 'C',
  },
];

const permissionCatalog = permissionResources.flatMap(
  ({ resource, category, scopes, scopeOverrides }) =>
    crudActions.map(({ action, key }) => ({
      resource,
      action,
      category,
      scopes: scopeOverrides?.[key] ?? scopes,
    })),
);

const scopeByCode: Record<string, ScopeType> = {
  C: ScopeType.CENTER_WIDE,
  H: ScopeType.ASSIGNED_CLASS,
  O: ScopeType.OWN_ACCOUNT,
};

function getScopeType(code: string): ScopeType {
  const scopeType = scopeByCode[code];
  if (!scopeType) {
    throw new Error(`Unsupported permission scope code: ${code}`);
  }
  return scopeType;
}

export async function seedPermissions(tx: Prisma.TransactionClient) {
  const resources = new Map<string, number>();
  const actions = new Map<string, number>();

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
    const allowedScopes = [...item.scopes].map(getScopeType);
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
