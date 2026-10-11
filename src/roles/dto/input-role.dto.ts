import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RolePermissionDto } from './role-permission.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const blankToUndefined = ({ value }: { value: unknown }) => {
  const v = typeof value === 'string' ? value.trim() : value;
  return v === '' ? undefined : v;
};

const parsePermissionJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizePermissions = ({
  value,
  obj,
}: {
  value: unknown;
  obj: Record<string, unknown>;
}): unknown => {
  if (typeof value === 'string') {
    const parsed = parsePermissionJson(value);
    if (parsed !== value) {
      value = parsed;
    }
  }

  if (
    Array.isArray(value) &&
    value.every(
      (permission) => typeof permission === 'object' && permission !== null,
    )
  ) {
    return plainToInstance(RolePermissionDto, value);
  }

  const values: unknown[] = Array.isArray(value) ? value : value ? [value] : [];
  const scopes =
    obj.scopes && typeof obj.scopes === 'object'
      ? (obj.scopes as Record<string, unknown>)
      : {};

  return plainToInstance(
    RolePermissionDto,
    values.map((entry) => {
      const [resource, action] = String(entry).split('::', 2);
      return {
        resource,
        action,
        scope: scopes[`${resource}::${action}`] ?? scopes[resource],
      };
    }),
  );
};

export class InputRoleDto {
  @Transform(trim)
  @IsString({ message: 'اسم القالب يجب أن يكون نصًا' })
  @MinLength(2, { message: 'يجب ألا يقل اسم القالب عن حرفين' })
  @MaxLength(100, { message: 'يجب ألا يتجاوز اسم القالب 100 حرف' })
  @IsNotEmpty({ message: 'اسم القالب مطلوب' })
  name: string;

  @Transform(blankToUndefined)
  @IsOptional()
  @IsString({ message: 'الوصف يجب أن يكون نصًا' })
  @MaxLength(400, { message: 'يجب ألا يتجاوز الوصف 400 حرف' })
  description?: string;

  @Transform(normalizePermissions)
  @IsArray({ message: 'الصلاحيات غير صالحة' })
  @ArrayMinSize(1, { message: 'اختر صلاحية واحدة على الأقل' })
  @ValidateNested({ each: true })
  @Type(() => RolePermissionDto)
  permissions: RolePermissionDto[];
}
