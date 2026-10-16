import 'reflect-metadata';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, ScopeType } from '@prisma/client';
import type { DirectPermissionGrant } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as Handlebars from 'handlebars';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { RolesService } from '../roles/roles.service';
import type { PermissionsData } from '../roles/helpers/roles.types';
import type { Request, Response } from 'express';

const staffId = '10000000-0000-4000-8000-000000000001';
const permissionId = '20000000-0000-4000-8000-000000000001';
const secondPermissionId = '20000000-0000-4000-8000-000000000002';
const actorId = '30000000-0000-4000-8000-000000000001';
const roleId = '40000000-0000-4000-8000-000000000001';
const scope = ScopeType.OWN_ACCOUNT;
const otherScope = ScopeType.CENTRE_WIDE;

function permissionData(): PermissionsData {
  return {
    selectedPermissionCount: 0,
    permissionColumns: [
      [
        {
          category: 'Staff',
          selectedCount: 0,
          resources: [
            {
              name: 'staff',
              actions: [
                {
                  id: permissionId,
                  resource: 'staff',
                  action: 'edit',
                  scopes: [scope, otherScope],
                  selected: false,
                },
              ],
            },
          ],
        },
      ],
      [],
    ],
  };
}

function setup() {
  const tx = {
    staff: { findUnique: jest.fn().mockResolvedValue({ id: staffId }) },
    permission: {
      findMany: jest.fn().mockResolvedValue([
        { id: permissionId, allowedScopes: [scope, otherScope] },
        { id: secondPermissionId, allowedScopes: [scope] },
      ]),
    },
    roleStaff: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    directPermissionGrant: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<void>) =>
      callback(tx),
    ),
    directPermissionGrant: tx.directPermissionGrant,
  };
  const roles = {
    getPermissionsWithCategory: jest.fn().mockResolvedValue(permissionData()),
  };
  const service = new StaffService(
    prisma as unknown as PrismaService,
    {} as AuditService,
    roles as unknown as RolesService,
  );
  return { tx, prisma, service };
}

const existingGrant = (
  scopeType: ScopeType = scope,
): DirectPermissionGrant => ({
  id: `grant-${scopeType}`,
  staffId,
  permissionId,
  scopeType,
  grantedById: 'original-admin',
  grantedAt: new Date('2026-01-01T00:00:00Z'),
  revokedAt: null,
});

describe('StaffService permissions', () => {
  it('leaves unchanged direct grants and their attribution alone', async () => {
    const { service, tx, prisma } = setup();
    tx.directPermissionGrant.findMany.mockResolvedValue([existingGrant()]);

    await service.editPermissions(
      staffId,
      { roleIds: [roleId], permissions: [{ permissionId, scope }] },
      actorId,
    );

    expect(tx.directPermissionGrant.upsert).not.toHaveBeenCalled();
    expect(tx.directPermissionGrant.updateMany).not.toHaveBeenCalled();
    expect(tx.roleStaff.deleteMany).toHaveBeenCalledWith({
      where: { staffId },
    });
    expect(tx.roleStaff.createMany).toHaveBeenCalledWith({
      data: [{ roleId, staffId, grantedById: actorId }],
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('clears both selections by revoking direct grants and removing roles', async () => {
    const { service, tx } = setup();
    tx.directPermissionGrant.findMany.mockResolvedValue([existingGrant()]);
    await service.editPermissions(
      staffId,
      { roleIds: [], permissions: [] },
      actorId,
    );
    expect(tx.roleStaff.deleteMany).toHaveBeenCalledWith({
      where: { staffId },
    });
    expect(tx.roleStaff.createMany).not.toHaveBeenCalled();
    expect(tx.directPermissionGrant.updateMany).toHaveBeenCalledWith({
      where: { staffId, id: { in: [`grant-${scope}`] }, revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(tx.directPermissionGrant.upsert).not.toHaveBeenCalled();
  });

  it('creates a new grant or reactivates its unique revoked row', async () => {
    const { service, tx } = setup();
    await service.editPermissions(
      staffId,
      { roleIds: [], permissions: [{ permissionId, scope }] },
      actorId,
    );
    expect(tx.roleStaff.createMany).not.toHaveBeenCalled();
    expect(tx.directPermissionGrant.upsert).toHaveBeenCalledWith({
      where: {
        staffId_permissionId_scopeType: {
          staffId,
          permissionId,
          scopeType: scope,
        },
      },
      create: {
        staffId,
        permissionId,
        scopeType: scope,
        grantedById: actorId,
        grantedAt: expect.any(Date) as Date,
      },
      update: {
        revokedAt: null,
        grantedById: actorId,
        grantedAt: expect.any(Date) as Date,
      },
    });
  });

  it('revokes the old scope when changing an action to another scope', async () => {
    const { service, tx } = setup();
    tx.directPermissionGrant.findMany.mockResolvedValue([existingGrant()]);
    await service.editPermissions(
      staffId,
      { roleIds: [], permissions: [{ permissionId, scope: otherScope }] },
      actorId,
    );
    expect(tx.directPermissionGrant.updateMany).toHaveBeenCalledWith({
      where: { staffId, id: { in: [`grant-${scope}`] }, revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(tx.directPermissionGrant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          staffId_permissionId_scopeType: {
            staffId,
            permissionId,
            scopeType: otherScope,
          },
        },
      }),
    );
  });

  it.each(
    [
      [{ permissionId: 'unknown', scope }],
      [{ permissionId, scope: ScopeType.ASSIGNED_ACTIVITY }],
      [
        { permissionId, scope },
        { permissionId, scope },
      ],
      [
        { permissionId, scope },
        { permissionId, scope: otherScope },
      ],
    ].map((permissions) => ({ permissions })),
  )(
    'rejects invalid permissions before any writes: %j',
    async ({ permissions }) => {
      const { service, tx } = setup();
      await expect(
        service.editPermissions(
          staffId,
          { roleIds: [roleId], permissions },
          actorId,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(tx.roleStaff.deleteMany).not.toHaveBeenCalled();
      expect(tx.roleStaff.createMany).not.toHaveBeenCalled();
      expect(tx.directPermissionGrant.updateMany).not.toHaveBeenCalled();
      expect(tx.directPermissionGrant.upsert).not.toHaveBeenCalled();
    },
  );

  it('rejects a nonexistent staff member even with empty selections', async () => {
    const { service, tx } = setup();
    tx.staff.findUnique.mockResolvedValue(null);
    await expect(
      service.editPermissions(
        staffId,
        { roleIds: [], permissions: [] },
        actorId,
      ),
    ).rejects.toThrow(NotFoundException);
    expect(tx.roleStaff.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates a direct-grant failure out of the transaction', async () => {
    const { service, tx, prisma } = setup();
    const failure = new Error('database write failed');
    tx.directPermissionGrant.upsert.mockRejectedValue(failure);
    await expect(
      service.editPermissions(
        staffId,
        { roleIds: [roleId], permissions: [{ permissionId, scope }] },
        actorId,
      ),
    ).rejects.toBe(failure);
    expect(tx.roleStaff.createMany).toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not save direct grants if role replacement fails', async () => {
    const { service, tx } = setup();
    const failure = new Error('role does not exist');
    tx.roleStaff.createMany.mockRejectedValue(failure);
    await expect(
      service.editPermissions(
        staffId,
        { roleIds: [roleId], permissions: [{ permissionId, scope }] },
        actorId,
      ),
    ).rejects.toBe(failure);
    expect(tx.directPermissionGrant.upsert).not.toHaveBeenCalled();
  });

  it('reports a serialization conflict instead of silently succeeding', async () => {
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2034',
        clientVersion: '6.19.3',
      }),
    );
    await expect(
      service.editPermissions(
        staffId,
        { roleIds: [], permissions: [] },
        actorId,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('reopens with the active scope checked and keeps only that scope on save', async () => {
    const { service, tx } = setup();
    tx.directPermissionGrant.findMany.mockResolvedValue([
      existingGrant(scope),
      existingGrant(otherScope),
    ]);
    const data = await service.getPermissionOptionsForStaff(staffId);
    const action = data.permissionColumns[0][0].resources[0].actions[0];
    expect(action.selected).toBe(true);
    expect(action.selectedScope).toBe(scope);
    expect(data.selectedPermissionCount).toBe(1);
    expect(tx.directPermissionGrant.findMany).toHaveBeenCalledWith({
      where: { staffId, revokedAt: null },
      select: { permissionId: true, scopeType: true },
    });

    await service.editPermissions(
      staffId,
      { roleIds: [], permissions: [{ permissionId, scope }] },
      actorId,
    );
    expect(tx.directPermissionGrant.updateMany).toHaveBeenCalledWith({
      where: { staffId, id: { in: [`grant-${otherScope}`] }, revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(tx.directPermissionGrant.upsert).not.toHaveBeenCalled();
  });

  it('reopens without checking an action that has no active grant', async () => {
    const { service } = setup();
    const data = await service.getPermissionOptionsForStaff(staffId);
    const action = data.permissionColumns[0][0].resources[0].actions[0];
    expect(action.selected).toBe(false);
    expect(action.selectedScope).toBeUndefined();
    expect(data.selectedPermissionCount).toBe(0);
  });
});

const view = (path: string) =>
  readFileSync(join(__dirname, '../../views', path), 'utf8');

describe('Permission editor submission', () => {
  it('renders staff permission IDs and retains role resource/action values', () => {
    const handlebars = Handlebars.create();
    handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    for (const name of ['ui/icon', 'ui/csrf', 'ui/submit']) {
      handlebars.registerPartial(name, '');
    }
    for (const name of ['permissions/folder', 'permissions/resource']) {
      handlebars.registerPartial(name, view(`partials/${name}.hbs`));
    }
    const data = permissionData();
    const resource = data.permissionColumns[0][0].resources[0];
    resource.actions[0].selected = true;
    resource.actions[0].selectedScope = otherScope;
    const staffHtml = handlebars.compile(
      view('partials/staff/permissions-dialog.hbs'),
    )({ ...data, staffId, roles: [] });
    expect(staffHtml).toContain('data-direct-grant-editor');
    expect(staffHtml).toContain(`value="${permissionId}"`);
    expect(staffHtml).toContain(`name="scopes[${permissionId}]"`);
    expect(staffHtml).toContain(`value="${otherScope}" selected`);

    const roleHtml = handlebars.compile(
      view('partials/permissions/resource.hbs'),
    )(resource);
    expect(roleHtml).toContain('value="staff::edit"');
    expect(roleHtml).toContain('name="scopes[staff::edit]"');
  });

  it.each([true, false])(
    'serializes checked actions for direct grants=%s',
    (direct) => {
      const listeners = new Map<string, (event: unknown) => void>();
      const document = {
        readyState: 'loading',
        addEventListener: (
          name: string,
          listener: (event: unknown) => void,
        ) => {
          listeners.set(name, listener);
        },
        querySelectorAll: () => [],
      };
      const script = view('partials/shared/scripts.hbs')
        .replace(/^<script>/, '')
        .replace(/<\/script>\s*$/, '');
      runInNewContext(script, { document });
      const input = {
        dataset: { permissionId, resource: 'staff', action: 'edit' },
        closest: () => ({ querySelector: () => ({ value: scope }) }),
      };
      const form = {
        hasAttribute: () => direct,
        querySelectorAll: jest.fn().mockReturnValue([input]),
      };
      const parameters = { permissions: '', scopes: {} };
      const event = {
        detail: { elt: { closest: () => form }, parameters },
      };
      listeners.get('htmx:configRequest')!(event);
      expect(form.querySelectorAll).toHaveBeenCalledWith(
        'input[name="permissions"]:checked',
      );
      expect(JSON.parse(parameters.permissions)).toEqual([
        direct
          ? { permissionId, scope }
          : { resource: 'staff', action: 'edit', scope },
      ]);
      expect(parameters).not.toHaveProperty('scopes');

      form.querySelectorAll.mockReturnValue([]);
      listeners.get('htmx:configRequest')!(event);
      expect(parameters.permissions).toBe('[]');
    },
  );
});

describe('Staff permissions save response', () => {
  it.each(['htmx', 'html', 'json'])(
    'handles %s after a successful save',
    async (mode) => {
      const service = {
        editPermissions: jest.fn().mockResolvedValue(undefined),
      };
      const controller = new StaffController(
        service as unknown as StaffService,
      );
      const request = {
        get: (name: string) =>
          name === 'HX-Request' && mode === 'htmx' ? 'true' : undefined,
        accepts: () => (mode === 'html' ? 'html' : 'json'),
      };
      const response = {
        setHeader: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        end: jest.fn(),
        json: jest.fn(),
        redirect: jest.fn(),
      };
      await controller.editPermissions(
        staffId,
        { roleIds: [], permissions: [] },
        { id: actorId },
        request as unknown as Request,
        response as unknown as Response,
      );
      expect(service.editPermissions).toHaveBeenCalledWith(
        staffId,
        { roleIds: [], permissions: [] },
        actorId,
      );
      if (mode === 'htmx') {
        expect(response.setHeader).toHaveBeenCalledWith(
          'HX-Redirect',
          `/staff/${staffId}`,
        );
        expect(response.status).toHaveBeenCalledWith(204);
      } else if (mode === 'html') {
        expect(response.redirect).toHaveBeenCalledWith(
          303,
          `/staff/${staffId}`,
        );
      } else {
        expect(response.json).toHaveBeenCalledWith({ success: true });
      }
    },
  );
});
