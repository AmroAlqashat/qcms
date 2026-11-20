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
      timeStyle: 'short',
      timeZone: 'Asia/Amman',
    }).format(activity.date),
  };
}

export function isActivityDay(date: Date) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' });
  return day.format(date) === day.format(new Date());
}
