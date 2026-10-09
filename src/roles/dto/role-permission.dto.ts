import { IsEnum, IsString, IsNotEmpty } from "class-validator";
import { ScopeType } from "@prisma/client";

export class RolePermissionDto {
  @IsString({ message: 'المورد غير صالح' })
  @IsNotEmpty({ message: 'المورد مطلوب' })
  resource: string;

  @IsString({ message: 'الإجراء غير صالح' })
  @IsNotEmpty({ message: 'الإجراء مطلوب' })
  action: string;

  @IsEnum(ScopeType, { message: 'النطاق غير صالح' })
  scope: ScopeType;
}
