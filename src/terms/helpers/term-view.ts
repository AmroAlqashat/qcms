import { TermType } from '@prisma/client';

export function termView<
  T extends {
    type: TermType;
    startDate: Date | null;
    endDate: Date | null;
  },
>(term: T) {
  const format = (date: Date | null) =>
    date
      ? new Intl.DateTimeFormat('ar-JO', {
          dateStyle: 'medium',
          timeZone: 'UTC',
        }).format(date)
      : '';
  return {
    ...term,
    typeLabel: term.type === TermType.CONTINUOUS ? 'فصل مستمر' : 'فصل عادي',
    isContinuous: term.type === TermType.CONTINUOUS,
    startDateLabel: format(term.startDate),
    endDateLabel: format(term.endDate),
  };
}
