import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO4217CurrencyCode,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// HTML forms send strings. Convert only decimal integers, leaving malformed
// values (including booleans, empty strings and arrays) for validation to reject.
function formInteger(value: unknown): unknown {
  return typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;
}

export class SettingsDto {
  // Make sure the new settings dto names match the DB key name and match in the frontend.

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'اسم المركز يجب أن يكون نصًا' })
  @IsNotEmpty({ message: 'أدخل اسم المركز' })
  @MaxLength(150, { message: 'يجب ألا يتجاوز اسم المركز 150 حرفًا' })
  centerName: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO4217CurrencyCode({ message: 'اختر رمز عملة صالحًا مثل JOD' })
  currency: string;

  // Boolean('false') is true, so do not use implicit boolean conversion here.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'اختر فتح التسجيل أو إغلاقه' })
  registrationOpen: boolean;

  @Transform(({ value }: { value: unknown }) => formInteger(value))
  @IsInt({ message: 'مهلة خمول الجلسة يجب أن تكون عددًا صحيحًا بالدقائق' })
  @Min(1, { message: 'مهلة خمول الجلسة يجب ألا تقل عن دقيقة واحدة' })
  @Max(Number.MAX_SAFE_INTEGER, { message: 'مهلة خمول الجلسة أكبر من الحد المدعوم' })
  sessionInactivityTimeoutMinutes: number;

  @Transform(({ value }: { value: unknown }) => formInteger(value))
  @IsInt({ message: 'مدة صلاحية التفويض يجب أن تكون عددًا صحيحًا بالساعات' })
  @Min(1, { message: 'مدة صلاحية التفويض يجب ألا تقل عن ساعة واحدة' })
  @Max(Number.MAX_SAFE_INTEGER, { message: 'مدة صلاحية التفويض أكبر من الحد المدعوم' })
  delegateAccessExpiryHours: number;
}
