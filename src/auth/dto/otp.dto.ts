import { IsString, Matches } from 'class-validator';

export class OtpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
