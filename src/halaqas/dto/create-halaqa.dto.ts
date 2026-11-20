import {
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsString,
  Length,
  MaxLength,
  Validate,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { MeetingDaysDto, WeeklyMeetings } from './meeting-days.dto';

export class createHalaqaDto {
  @IsString()
  @Length(5, 5)
  termId: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsDefined({ message: 'مواعيد اللقاء الأسبوعية مطلوبة' })
  @IsObject({ message: 'مواعيد اللقاء الأسبوعية غير صالحة' })
  @Validate(WeeklyMeetings)
  @ValidateNested()
  @Type(() => MeetingDaysDto)
  meetingDays: MeetingDaysDto;
}
