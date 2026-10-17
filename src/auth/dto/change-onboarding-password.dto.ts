import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ChangeOnboardingPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @MaxLength(128)
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
