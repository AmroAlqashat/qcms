import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class InviteStaffDto {

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  jobTitle: string;
}
