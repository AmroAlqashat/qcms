import { plainToInstance, Transform, Type } from 'class-transformer';
import { IsArray, IsUUID, ValidateNested } from 'class-validator';
import { DirectPermissionGrantDto } from './direct-permission-grant.dto';

// Checkboxes can arrive as one ID, several IDs, or no field at all.
// Give the service an array in every case; [] means clear the selection.
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

  // The HTMX handler sends the checked grants as a JSON string.
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      // A native form sends an ID rather than JSON. Keep the value so it
      // can be paired with its scope below and validated, not silently dropped.
      parsed = value;
    }
  }

  const values = Array.isArray(parsed) ? parsed : [parsed];
  const scopes =
    obj.scopes && typeof obj.scopes === 'object'
      ? (obj.scopes as Record<string, unknown>)
      : {};

  // Native forms send checked IDs plus scopes[permissionId]; HTMX sends objects.
  // Only submitted IDs become grants: a leftover scope alone selects nothing.
  // Class instances let ValidateNested run the direct-grant DTO's validators.
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
  // Repeated roleIds form fields represent the complete desired role selection.
  @Transform(normalizeArray)
  @IsArray({ message: 'قوالب الصلاحيات غير صالحة' })
  @IsUUID('4', {
    each: true,
    message: 'معرف قالب الصلاحيات غير صالح',
  })
  // Defaults also handle omitted fields, whose transforms may not run.
  roleIds: string[] = [];

  // Each item has permissionId/scope, not RolePermissionDto's resource/action.
  // This property determines the item type used in StaffService.editPermissions.
  @Transform(parsePermissions)
  @IsArray({ message: 'المنح المباشرة غير صالحة' })
  @ValidateNested({ each: true })
  @Type(() => DirectPermissionGrantDto)
  permissions: DirectPermissionGrantDto[] = [];
}
