import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { HALAQA_WEEK_DAYS } from '../halaqa-week-days';

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
const seconds = (time: string) => {
  const [hour, minute, second = 0] = time.split(':').map(Number);
  return hour * 3600 + minute * 60 + second;
};

// Return one useful error for the entire nested schedule, including the day.
export function meetingDaysError(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'يرجى إدخال مواعيد اللقاء الأسبوعية';
  }
  const { startTime, endTime } = value as Record<string, unknown>;
  if (
    !Array.isArray(startTime) ||
    !Array.isArray(endTime) ||
    startTime.length !== 7 ||
    endTime.length !== 7
  ) {
    return 'يجب إرسال أوقات الأيام السبعة، مع ترك الأيام غير المختارة فارغة';
  }
  let meetings = 0;
  for (let index = 0; index < 7; index++) {
    const start: unknown = startTime[index];
    const end: unknown = endTime[index];
    const day = HALAQA_WEEK_DAYS[index];
    if (typeof start !== 'string' || typeof end !== 'string')
      return `وقت غير صالح ليوم ${day}`;
    if (start === '' && end === '') continue;
    if (start === '') return `يرجى إدخال وقت البداية ليوم ${day}`;
    if (end === '') return `يرجى إدخال وقت النهاية ليوم ${day}`;
    if (!timePattern.test(start) || !timePattern.test(end))
      return `وقت غير صالح ليوم ${day}`;
    if (seconds(end) <= seconds(start))
      return `يجب أن يكون وقت النهاية بعد وقت البداية ليوم ${day}`;
    meetings++;
  }
  if (!meetings) return 'يرجى تحديد موعد لقاء واحد على الأقل';
}

@ValidatorConstraint({ name: 'weeklyMeetings', async: false })
export class WeeklyMeetings implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return meetingDaysError(value) === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    return meetingDaysError(args.value) ?? 'مواعيد اللقاء غير صالحة';
  }
}

export class MeetingDaysDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @IsString({ each: true })
  @Matches(/^(?:([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)?$/, { each: true })
  startTime: string[];

  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @IsString({ each: true })
  @Matches(/^(?:([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)?$/, { each: true })
  endTime: string[];
}
