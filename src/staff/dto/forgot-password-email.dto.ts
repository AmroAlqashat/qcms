import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordEmailDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'أدخل بريدًا إلكترونيًا صالحًا' })
  @MaxLength(254, { message: 'يجب ألا يتجاوز البريد الإلكتروني 254 حرفًا' })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  @IsString()
  email!: string;
}
