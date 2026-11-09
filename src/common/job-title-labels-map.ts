import { JobTitle } from '@prisma/client';

export const jobTitleLabels: Record<JobTitle, string> = {
  SUPERADMIN: 'المدير العام',
  ADMIN: 'إداري',
  TEACHER: 'معلّم',
  FINANCE: 'مسؤول مالي',
  MISC: 'أخرى',
};

export function jobTitleOptions(selected?: unknown) {
  return Object.values(JobTitle).map((value) => ({
    value,
    label: jobTitleLabels[value],
    selected: value === selected,
  }));
}
