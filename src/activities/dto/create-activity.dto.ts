import { Transform } from 'class-transformer';
import { ActivityLevel } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  IsIn,
  IsUUID,
  ValidateIf,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  isUUID,
} from 'class-validator';

@ValidatorConstraint({ name: 'activityHalaqa', async: false })
class ActivityHalaqa implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const { level } = args.object as CreateActivityDto;

    if (level === ActivityLevel.HALAQA_SPECIFIC) {
      return typeof value === 'string' && isUUID(value);
    }

    if (level === ActivityLevel.CENTER_WIDE) {
      return value === undefined;
    }

    // IsEnum reports an invalid level separately.
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const { level } = args.object as CreateActivityDto;

    return level === ActivityLevel.HALAQA_SPECIFIC
      ? 'يجب اختيار حلقة صالحة للنشاط الخاص بحلقة'
      : 'لا يمكن ربط نشاط المركز بحلقة محددة';
  }
}

export class CreateActivityDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'اسم النشاط غير صالح' })
  @IsNotEmpty({ message: 'اسم النشاط مطلوب' })
  name!: string;

  @IsEnum(ActivityLevel, { message: 'نوع النشاط غير صالح' })
  level!: ActivityLevel;

  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @Validate(ActivityHalaqa)
  halaqaId?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'يجب إدخال تاريخ النشاط بصيغة صحيحة',
  })
  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: 'تاريخ النشاط غير صالح' },
  )
  date!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'أدخل وقت النشاط' })
  time!: string;

  @IsUUID('4', { message: 'اختر نموذج تسجيل صالحًا' })
  formId!: string;

  @ValidateIf((_o, v) => v !== undefined)
  @IsIn(['true', 'false'], { message: 'حالة التسجيل غير صالحة' })
  isFormEnabled?: string;

  @ValidateIf((_o, v) => v !== undefined && v !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
    message: 'موعد الإغلاق غير صالح',
  })
  @IsDateString({ strict: true }, { message: 'موعد الإغلاق غير صالح' })
  closeDate?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'موقع النشاط غير صالح' })
  @IsNotEmpty({ message: 'موقع النشاط مطلوب' })
  @MaxLength(200, { message: 'يجب ألا يتجاوز موقع النشاط 200 حرف' })
  location!: string;
}
