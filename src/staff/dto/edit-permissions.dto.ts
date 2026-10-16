import { plainToInstance, Transform, Type } from 'class-transformer';
import { IsArray, IsUUID, ValidateNested } from 'class-validator';
import { DirectPermissionGrantDto } from './direct-permission-grant.dto';

const normalizeArray = ({ value }: { value: unknown }): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  return value === undefined || value === null || value === '' ? [] : [value];
};

const parsePermissions = ({
  value,
  obj,
}: {
  value: unknown;
  obj: Record<string, unknown>;
}): unknown => {
  if (value === undefined || value === null || value === '') return [];

  let parsed: unknown = value;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value;
    }
  }

  const values = Array.isArray(parsed) ? parsed : [parsed];
  const scopes =
    obj.scopes && typeof obj.scopes === 'object'
      ? (obj.scopes as Record<string, unknown>)
      : {};

  // Native forms send checked IDs plus scopes; HTMX sends JSON objects.
  return plainToInstance(
    DirectPermissionGrantDto,
    values.map((entry: unknown) =>
      typeof entry === 'string'
        ? { permissionId: entry, scope: scopes[entry] }
        : entry,
    ),
  );
};

export class EditPermissionsDto {
  @Transform(normalizeArray)
  @IsArray({ message: 'قوالب الصلاحيات غير صالحة' })
  @IsUUID('4', {
    each: true,
    message: 'معرف قالب الصلاحيات غير صالح',
  })
  roleIds: string[] = [];

  @Transform(parsePermissions)
  @IsArray({ message: 'المنح المباشرة غير صالحة' })
  @ValidateNested({ each: true })
  @Type(() => DirectPermissionGrantDto)
  permissions: DirectPermissionGrantDto[] = [];
}
