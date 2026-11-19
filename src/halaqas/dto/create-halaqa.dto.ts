import {
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsString,
  Length,
  Validate,
  ValidateNested,
} from 'class-validator';
import { MeetingDaysDto, WeeklyMeetings } from './meeting-days.dto';
import { Type } from 'class-transformer';

export class createHalaqaDto {
  @IsString()
  @Length(5, 5)
  termId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsDefined({ message: 'مواعيد اللقاء الأسبوعية مطلوبة' })
  @IsObject({ message: 'مواعيد اللقاء الأسبوعية غير صالحة' })
  @Validate(WeeklyMeetings)
  @ValidateNested()
  @Type(() => MeetingDaysDto)
  meetingDays: MeetingDaysDto;
}
