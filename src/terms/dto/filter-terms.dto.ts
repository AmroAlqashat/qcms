import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class FilteredTermsDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .trim()
          .replace(/[٠-٩۰-۹]/g, (digit) =>
            String(digit.charCodeAt(0) - (digit <= '٩' ? 0x660 : 0x6f0)),
          )
      : value,
  )
  @IsString({ message: 'يجب أن يكون معرّف الفصل نصًا' })
  @MaxLength(5, { message: 'يجب ألا يتجاوز معرّف الفصل في البحث 5 أرقام' })
  @Matches(/^[0-9]*$/, { message: 'يجب أن يحتوي معرّف الفصل على أرقام فقط' })
  termId?: string;
}
