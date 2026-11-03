import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class changeMyPasswordDto {
  @IsEmail()
  @MaxLength(254, { message: 'يجب ألا يتجاوز البريد الإلكتروني 254 حرفًا' })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  email: string;

  @Matches(/^\d{6}$/)
  @IsNotEmpty()
  @IsString()
  otp: string;

  @IsString()
  @Length(12)
  @IsNotEmpty()
  newPassword: string;
}
