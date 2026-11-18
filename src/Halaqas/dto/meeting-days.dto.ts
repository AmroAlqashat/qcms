import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';

export class MeetingDaysDto {
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @IsString({ each: true })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, { each: true })
  startTime: string[];

  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @IsString({ each: true })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/, { each: true })
  endTime: string[];
}
