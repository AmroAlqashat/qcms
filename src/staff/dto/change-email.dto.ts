import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ForgotPasswordEmailDto } from './forgot-password-email.dto';

export class RequestEmailChangeDto extends ForgotPasswordEmailDto {
  @IsString()
  @MinLength(8, { message: 'أدخل كلمة المرور الحالية' })
  @MaxLength(128)
  currentPassword!: string;
}

export class ConfirmEmailChangeDto extends ForgotPasswordEmailDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'أدخل رمز التحقق المكوّن من 6 أرقام' })
  otp!: string;
}
