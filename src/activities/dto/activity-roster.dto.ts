import { Transform } from 'class-transformer';
import {
  Length,
  Matches,
  IsString,
  ArrayUnique,
  IsArray,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { FormAnswers } from '../../forms/dto/form-answers.decorator';

export class RegisterActivityDto {
  @IsUUID(undefined, { message: 'اختر طالبًا صالحًا' })
  studentId!: string;

  @FormAnswers()
  formAnswers!: Record<string, unknown>;
}
function trimText({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

export class ReturningGuestDto {
  @IsUUID(undefined, { message: 'اختر ضيفًا من القائمة' })
  guestId!: string;

  @FormAnswers()
  formAnswers!: Record<string, unknown>;
}

export class RegisterGuestDto {
  @Transform(trimText)
  @IsString({ message: 'اسم الضيف مطلوب' })
  @Length(1, 150, { message: 'أدخل اسم الضيف بحد أقصى 150 حرفًا' })
  fullName!: string;

  @Transform(trimText)
  @IsString({ message: 'اسم ولي الأمر مطلوب' })
  @Length(1, 150, { message: 'أدخل اسم ولي الأمر بحد أقصى 150 حرفًا' })
  guardianName!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .replace(/[٠-٩۰-۹]/g, (d) =>
            String(d.charCodeAt(0) - (d <= '٩' ? 0x660 : 0x6f0)),
          )
          .replace(/[\s()-]/g, '')
      : value,
  )
  @Matches(/^\+?\d{7,15}$/, { message: 'أدخل رقم هاتف صالحًا لولي الأمر' })
  guardianPhone!: string;

  @FormAnswers()
  formAnswers!: Record<string, unknown>;
}

export class ActivityAttendanceDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? [value] : value,
  )
  @ValidateIf((_o, v) => v !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true, message: 'معرّف الطالب غير صالح' })
  present?: string[];
  @IsUUID(undefined, { each: true, message: 'قائمة المشاركين غير صالحة' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? [value] : value,
  )
  @IsArray()
  @ArrayUnique()
  roster!: string[];
}
