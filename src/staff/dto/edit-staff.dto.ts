import { JobTitle } from '@prisma/client';
import {
  IsDate,
  IsNumberString,
  IsString,
  IsEnum,
  MaxLength,
  MinLength,
  isISO8601,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class EditStaffDto {
  @IsString({ message: 'الاسم الكامل يجب أن يكون نصًا' })
  @MinLength(2, { message: 'يجب ألا يقل الاسم الكامل عن حرفين' })
  @MaxLength(100, { message: 'يجب ألا يتجاوز الاسم الكامل 100 حرف' })
  fullName: string;

  @IsEnum(JobTitle, { message: 'اختر مسمى وظيفيًا من القائمة.' })
  jobTitle: JobTitle;

  @IsString()
  @MaxLength(15)
  nationalId: string;

  @Transform(
    ({ value }: { value: unknown }) => {
      if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !isISO8601(value, { strict: true })
      ) {
        return new Date(NaN);
      }

      return new Date(`${value}T00:00:00.000Z`);
    },
    { toClassOnly: true },
  )
  @IsDate()
  dateOfBirth: Date;

  @IsNumberString()
  @MaxLength(20)
  phoneNumber: string;
}
