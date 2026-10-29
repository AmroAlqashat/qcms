import { StaffStatus } from '@prisma/client';

const statusLabels: Record<StaffStatus, string> = {
  ACTIVE: 'نشط',
  INACTIVE: 'موقوف',
  PENDING: 'بانتظار التفعيل',
  DELETED: 'محذوف',
};

export function formatStaffStatus(status: StaffStatus): string {
  return statusLabels[status];
}

export function formatStaffDate(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

export function formatStaffPhone(phone: string | null): string | undefined {
  if (!phone) {
    return undefined;
  }

  const normalizedPhone = phone.replace(/[^\d+]/g, '');

  if (/^\+962\d{9}$/.test(normalizedPhone)) {
    return `${normalizedPhone.slice(0, 4)} ${normalizedPhone.slice(4, 6)} ${normalizedPhone.slice(6, 9)} ${normalizedPhone.slice(9)}`;
  }

  return normalizedPhone;
}
