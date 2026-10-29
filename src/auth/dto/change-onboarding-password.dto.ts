import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'passwordsMatch', async: false })
class PasswordsMatch implements ValidatorConstraintInterface {
  validate(confirmPassword: unknown, args: ValidationArguments): boolean {
    const dto = args.object as ChangeOnboardingPasswordDto;

    return (
      typeof confirmPassword === 'string' && confirmPassword === dto.newPassword
    );
  }
}

export class ChangeOnboardingPasswordDto {
  @IsString({ message: 'كلمة المرور الجديدة يجب أن تكون نصًا' })
  @IsNotEmpty({ message: 'كلمة المرور الجديدة مطلوبة' })
  @MinLength(8, { message: 'كلمة المرور يجب ألا تقل عن 8 أحرف' })
  @MaxLength(128, { message: 'كلمة المرور يجب ألا تزيد عن 128 حرفًا' })
  newPassword!: string;

  @IsString({ message: 'تأكيد كلمة المرور يجب أن يكون نصًا' })
  @IsNotEmpty({ message: 'تأكيد كلمة المرور مطلوب' })
  @Validate(PasswordsMatch, {
    message: 'كلمتا المرور غير متطابقتين',
  })
  confirmPassword!: string;
}
