import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { validateFormComponents } from '../helpers/validate-form-components';

// Checks every component (type, key, forbidden properties, nesting...).
// The rules live in helpers/; this only connects them to class-validator.
@ValidatorConstraint({ name: 'safeFormComponents', async: false })
export class SafeFormComponents implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return validateFormComponents(value) === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    return validateFormComponents(args.value) ?? 'حقول النموذج غير صالحة';
  }
}

export class FormSchemaDto {
  @IsIn(['form'], { message: 'نوع النموذج غير مدعوم' })
  display!: 'form';

  @IsArray({ message: 'حقول النموذج غير صالحة' })
  @ArrayMinSize(1, { message: 'يجب أن يحتوي النموذج على حقل واحد على الأقل' })
  @ArrayMaxSize(50, { message: 'يجب ألا يتجاوز عدد حقول النموذج 50 حقلًا' })
  @IsObject({ each: true, message: 'حقول النموذج غير صالحة' })
  @Validate(SafeFormComponents)
  components!: Record<string, unknown>[];
}
