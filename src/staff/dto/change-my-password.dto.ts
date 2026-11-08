import { IsString, Matches } from 'class-validator';
import { NewPasswordDto } from '../../common/dto/new-password.dto';

export class ChangeMyPasswordDto extends NewPasswordDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'أدخل رمز التحقق المكوّن من 6 أرقام' })
  otp!: string;
}
