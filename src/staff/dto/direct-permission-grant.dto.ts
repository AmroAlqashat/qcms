import { IsEnum, IsUUID } from 'class-validator';
import { ScopeType } from '@prisma/client';

export class DirectPermissionGrantDto {
  @IsUUID('4', { message: 'معرف الصلاحية غير صالح' })
  permissionId: string;

  @IsEnum(ScopeType, { message: 'النطاق غير صالح' })
  scope: ScopeType;
}
