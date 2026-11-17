import { ScopeType } from '@prisma/client';

export const scopeLabels: Record<ScopeType, string> = {
  [ScopeType.CENTER_WIDE]: 'المركز بالكامل',
  [ScopeType.ASSIGNED_CLASS]: 'الحلقات المعيّنة',
  [ScopeType.OWN_ACCOUNT]: 'الحساب الشخصي',
};
