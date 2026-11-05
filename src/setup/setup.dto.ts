import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SetupDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, {
    message: 'أدخل رمز الإعداد المكوّن من 64 حرفًا.',
  })
  token!: string;

  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(2, 100, { message: 'الاسم مطلوب ويجب أن يكون بين حرفين و100 حرف.' })
  fullName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'أدخل بريدًا إلكترونيًا صالحًا.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12, { message: 'استخدم كلمة مرور من 12 حرفًا على الأقل.' })
  @MaxLength(128)
  password!: string;

  @IsString()
  @Length(12, 128)
  confirmPassword!: string;
}
