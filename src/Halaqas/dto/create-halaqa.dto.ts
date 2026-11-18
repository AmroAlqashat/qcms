import { IsNotEmpty, IsString, Length, ValidateNested } from 'class-validator';
import { MeetingDaysDto as MeetingDaysDto } from './meeting-days.dto';
import { Type } from 'class-transformer';

export class createHalaqaDto {
  @IsString()
  @Length(5, 5)
  termId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @ValidateNested()
  @Type(() => MeetingDaysDto)
  meetingDays: MeetingDaysDto;
}
