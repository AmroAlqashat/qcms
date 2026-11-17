import { Transform } from 'class-transformer';
import { TermType } from '@prisma/client';
import {
  IsEnum,
  IsString,
  Matches,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  isISO8601,
} from 'class-validator';

@ValidatorConstraint({ name: 'termDate', async: false })
class TermDate implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const { type } = args.object as CreateTermDto;
    if (type === TermType.CONTINUOUS) return value === undefined;
    if (type !== TermType.STANDARD) return true; // IsEnum reports invalid types.
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      isISO8601(value, { strict: true })
    );
  }

  defaultMessage(args: ValidationArguments): string {
    if ((args.object as CreateTermDto).type === TermType.CONTINUOUS) {
      return 'لا يمكن تحديد تاريخ بداية أو نهاية للفصل المستمر';
    }
    return args.property === 'startDate'
      ? 'تاريخ بداية صالح مطلوب للفصل العادي بصيغة YYYY-MM-DD'
      : 'تاريخ نهاية صالح مطلوب للفصل العادي بصيغة YYYY-MM-DD';
  }
}

export class CreateTermDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'يجب أن يكون معرّف الفصل نصًا' })
  @Matches(/^[1-9][0-9]{3}[1-9]$/, {
    message: 'يجب أن يتكون معرّف الفصل من سنة بأربعة أرقام ورقم فصل من 1 إلى 9',
  })
  termId!: string;

  @IsEnum(TermType, { message: 'نوع الفصل غير صالح' })
  type!: TermType;

  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @Validate(TermDate)
  startDate?: string;

  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @Validate(TermDate)
  endDate?: string;
}
