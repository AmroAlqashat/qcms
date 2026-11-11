import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { ScopeType } from '@prisma/client';

export class RolePermissionDto {
  @IsString({ message: 'المورد غير صالح' })
  @IsNotEmpty({ message: 'المورد مطلوب' })
  resource: number;

  @IsString({ message: 'الإجراء غير صالح' })
  @IsNotEmpty({ message: 'الإجراء مطلوب' })
  action: number;

  @IsEnum(ScopeType, { message: 'النطاق غير صالح' })
  scope: ScopeType;
}
