import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsOptional, IsUUID } from 'class-validator';

export class UpdateStaffHalaqasDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown[] => {
    if (value === undefined) return [];
    if (Array.isArray(value)) {
      return Array.from(value, (item: unknown) => item);
    }
    return [value];
  })
  @IsArray()
  @ArrayUnique({ message: 'لا يمكن اختيار الحلقة أكثر من مرة' })
  @IsUUID(undefined, {
    each: true,
    message: 'إحدى الحلقات المحددة غير صالحة',
  })
  halaqaIds!: string[];
}
