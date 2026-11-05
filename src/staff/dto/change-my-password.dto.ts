import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class changeMyPasswordDto {
  @IsOptional()
  @IsEmail({}, { message: 'أدخل بريدًا إلكترونيًا صالحًا' })
  @MaxLength(254, { message: 'يجب ألا يتجاوز البريد الإلكتروني 254 حرفًا' })
  email?: string;

  @Matches(/^\d{6}$/, { message: 'أدخل رمز التحقق المكوّن من 6 أرقام' })
  @IsNotEmpty({ message: 'رمز التحقق مطلوب' })
  @IsString()
  otp!: string;

  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب ألا تقل عن 8 أحرف' })
  @MaxLength(128, { message: 'كلمة المرور يجب ألا تزيد عن 128 حرفًا' })
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة' })
  newPassword!: string;
}
