import { IsEmail, IsString, MaxLength, MinLength, IsNotEmpty } from 'class-validator';

export class InviteStaffDto {

  @IsEmail()
  @MaxLength(254)
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsNotEmpty()
  jobTitle: string;
}
