import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { EditPermissionsDto } from './edit-permissions.dto';

const permissionId = '10000000-0000-4000-8000-000000000001';
const roleId = '20000000-0000-4000-8000-000000000001';
const grant = { permissionId, scope: ScopeType.OWN_ACCOUNT };

const parse = (body: Record<string, unknown>): Promise<EditPermissionsDto> =>
  new ValidationPipe({ transform: true, whitelist: true }).transform(body, {
    type: 'body',
    metatype: EditPermissionsDto,
  }) as Promise<EditPermissionsDto>;

describe('EditPermissionsDto', () => {
  it.each([{}, { roleIds: '', permissions: '' }, { permissions: '[]' }])(
    'normalizes an empty selection: %j',
    async (body) => {
      const dto = await parse(body);
      expect(dto.roleIds).toEqual([]);
      expect(dto.permissions).toEqual([]);
    },
  );

  it.each(
    [JSON.stringify([grant]), [grant]].map((permissions) => ({ permissions })),
  )('accepts direct grant objects: %j', async ({ permissions }) => {
    const dto = await parse({ permissions, roleIds: roleId });
    expect(dto.permissions).toEqual([grant]);
    expect(dto.roleIds).toEqual([roleId]);
  });

  it('normalizes a native form ID with its scope', async () => {
    const dto = await parse({
      permissions: permissionId,
      scopes: { [permissionId]: ScopeType.OWN_ACCOUNT },
    });
    expect(dto.permissions).toEqual([grant]);
    expect(dto.roleIds).toEqual([]);
  });

  it('ignores scopes for unchecked native form actions', async () => {
    const dto = await parse({
      scopes: { [permissionId]: ScopeType.OWN_ACCOUNT },
    });
    expect(dto.permissions).toEqual([]);
  });

  it.each(
    [
      [{ permissionId: 'invalid', scope: ScopeType.OWN_ACCOUNT }],
      [{ permissionId, scope: 'INVALID_SCOPE' }],
      [{ permissionId }],
      [{ resource: 'staff', action: 'edit', scope: ScopeType.OWN_ACCOUNT }],
      'not-json',
      'null',
      'false',
      '[null]',
      '[1]',
    ].map((permissions) => ({ permissions })),
  )('rejects malformed direct grants: %j', async ({ permissions }) => {
    await expect(parse({ permissions })).rejects.toThrow(BadRequestException);
  });

  it('rejects an invalid role ID', async () => {
    await expect(parse({ roleIds: ['invalid'] })).rejects.toThrow();
  });
});
