import { IsString, Matches } from 'class-validator';

export class VerifyOnboardingOtpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
