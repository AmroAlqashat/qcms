import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { FormSchemaDto } from './form-schema.dto';

export class CreateFormDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'اسم النموذج غير صالح' })
  @IsNotEmpty({ message: 'اسم النموذج مطلوب' })
  @MaxLength(200, { message: 'يجب ألا يتجاوز اسم النموذج 200 حرف' })
  name!: string;

  @IsDefined({ message: 'بيانات النموذج مطلوبة' })
  @IsObject({ message: 'بيانات النموذج غير صالحة' })
  @ValidateNested()
  @Type(() => FormSchemaDto)
  form!: FormSchemaDto;
}
