import { IsEnum, IsUUID } from 'class-validator';
import { ScopeType } from '@prisma/client';

// One checked staff action and its chosen scope. RolePermissionDto remains
// separate because role forms identify actions by resource/action instead.
export class DirectPermissionGrantDto {
  // This validates the ID's format; the service checks that the row exists.
  @IsUUID('4', { message: 'معرف الصلاحية غير صالح' })
  permissionId: string;

  // A valid enum value must also belong to this permission's allowedScopes,
  // which the service checks against the database before saving.
  @IsEnum(ScopeType, { message: 'النطاق غير صالح' })
  scope: ScopeType;
}
