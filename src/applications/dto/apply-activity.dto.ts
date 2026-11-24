import { Transform } from 'class-transformer';
import { IsISO8601, Matches } from 'class-validator';
import { FormAnswers } from '../../forms/dto/form-answers.decorator';

// Arabic-Indic (٠-٩) and Persian (۰-۹) digits -> 0-9, and no spaces.
function latinDigits({ value }: { value: unknown }) {
  return typeof value === 'string'
    ? value
        .replace(/[٠-٩۰-۹]/g, (d) =>
          String(d.charCodeAt(0) - (d <= '٩' ? 0x660 : 0x6f0)),
        )
        .replace(/\s/g, '')
    : value;
}

// A public applicant: an existing student, identified by national ID and
// date of birth, plus the answers to the activity's form.
export class ApplyActivityDto {
  @Transform(latinDigits)
  @Matches(/^\d{1,20}$/, { message: 'أدخل الرقم الوطني بالأرقام فقط' })
  nationalId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'أدخل تاريخ الميلاد' })
  @IsISO8601({ strict: true }, { message: 'تاريخ الميلاد غير صالح' })
  dateOfBirth!: string;

  @FormAnswers()
  formAnswers!: Record<string, unknown>;
}
