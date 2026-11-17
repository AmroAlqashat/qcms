import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, Min } from 'class-validator';
import { ScopeType } from '@prisma/client';

export class RolePermissionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty({ message: 'المورد مطلوب' })
  resource: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNotEmpty({ message: 'الإجراء مطلوب' })
  action: number;

  @IsEnum(ScopeType, { message: 'النطاق غير صالح' })
  scope: ScopeType;
}
