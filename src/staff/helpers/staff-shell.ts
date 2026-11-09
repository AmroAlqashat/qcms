import { jobTitleOptions } from '../../common/job-title-labels-map';
export const staffShell = (values: Record<string, unknown> = {}) => ({
  jobTitleOptions: jobTitleOptions(
    (values.form as { jobTitle?: unknown } | undefined)?.jobTitle,
  ),
  activeNav: 'staff',
  sectionTitle: 'الموظفون',
  ...values,
});
