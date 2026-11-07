import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordEmailDto {
  @IsEmail({}, { message: 'أدخل بريدًا إلكترونيًا صالحًا' })
  @MaxLength(254, { message: 'يجب ألا يتجاوز البريد الإلكتروني 254 حرفًا' })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  @IsString()
  email!: string;
}
