import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { ChangeMyPasswordDto } from './change-my-password.dto';

export class ForgotPasswordDto extends ChangeMyPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'أدخل بريدًا إلكترونيًا صالحًا' })
  @MaxLength(254)
  @IsString()
  email!: string;
}
