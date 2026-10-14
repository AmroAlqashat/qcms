import { Transform } from 'class-transformer';
import { StaffStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class FilteredStaffDto {
  @IsOptional()
  @MaxLength(100, { message: 'يجب ألا يتجاوز خانة البحث 100 حرف' })
  searchField?: string; //can be emp or job title

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsEnum(StaffStatus, { message: 'invalid staff status' })
  status?: StaffStatus;

  @IsOptional()
  halaqa?: string;

  @IsOptional()
  role?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
