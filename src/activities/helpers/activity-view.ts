import { ActivityLevel } from '@prisma/client';

export function activityView<T extends { level: ActivityLevel; date: Date }>(
  activity: T,
) {
  return {
    ...activity,
    levelLabel:
      activity.level === ActivityLevel.CENTER_WIDE
        ? 'نشاط على مستوى المركز'
        : 'نشاط خاص بحلقة',
    dateLabel: new Intl.DateTimeFormat('ar-JO', {
      dateStyle: 'medium',
      timeZone: 'UTC',
    }).format(activity.date),
  };
}
