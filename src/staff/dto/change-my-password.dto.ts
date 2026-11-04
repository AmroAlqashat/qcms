import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class changeMyPasswordDto {
  @Matches(/^\d{6}$/, { message: 'أدخل رمز التحقق المكوّن من 6 أرقام' })
  @IsNotEmpty({ message: 'رمز التحقق مطلوب' })
  @IsString()
  otp!: string;

  @IsString()
  @MinLength(12, { message: 'كلمة المرور يجب ألا تقل عن 12 حرفًا' })
  @MaxLength(128, { message: 'كلمة المرور يجب ألا تزيد عن 128 حرفًا' })
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة' })
  newPassword!: string;
}
