import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { StaffStatus } from '@prisma/client';
import { createHmac } from 'node:crypto';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

// Inject a JWT double: these tests cover our flow decisions, not the JWT library.
// This also avoids loading its ESM implementation in the project's CJS Jest runner.
jest.mock('@nestjs/jwt', () => ({ JwtService: jest.fn() }));

const secret = 'auth-flow-test-secret';
const staffId = '10000000-0000-4000-8000-000000000001';
const password = 'test-only-password';
const credentials = { email: 'staff@example.com', password };
const profile = { fullName: 'Test Staff', jobTitle: 'Teacher' };
let passwordHash: string;

function setup(
  status: StaffStatus = StaffStatus.ACTIVE,
  mustChangePassword = false,
) {
  const staff = {
    id: staffId,
    email: credentials.email,
    passwordHash,
    status,
    mustChangePassword,
  };
  const tx = {
    staffMembers: {
      findUnique: jest.fn().mockResolvedValue(staff),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    oTPs: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<void>) =>
      callback(tx),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue({}) };
  const jwt = {
    signAsync: jest.fn((claims: { tokenUse: string }) =>
      Promise.resolve(`test-${claims.tokenUse}`),
    ),
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    jwt as unknown as JwtService,
  );
  return { service, prisma, jwt, audit };
}

describe('AuthService sign-in decisions and onboarding', () => {
  const originalSecret = process.env.JWT_SECRET_KEY;

  beforeAll(async () => {
    process.env.JWT_SECRET_KEY = secret;
    passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET_KEY;
    else process.env.JWT_SECRET_KEY = originalSecret;
  });

  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('signs in active staff without issuing an onboarding code', async () => {
    const { service, prisma, jwt } = setup();
    const result = await service.signInHelper({
      ...credentials,
      email: ' Staff@Example.com ',
    });
    expect(result.kind).toBe('signed-in');
    if (result.kind !== 'signed-in') throw new Error('Expected a session');
    expect(result.accessToken).toBe('test-access');
    expect(result.refreshToken).toBe('test-refresh');
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: staffId,
      tokenUse: 'access',
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: staffId, tokenUse: 'refresh' },
      { expiresIn: '7d' },
    );
    expect(prisma.staffMembers.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: credentials.email } }),
    );
    expect(prisma.oTPs.upsert).not.toHaveBeenCalled();
  });

  it('sends pending staff to email verification without granting a session', async () => {
    const { service, prisma, jwt } = setup(StaffStatus.PENDING, true);
    const result = await service.signInHelper(credentials);
    expect(result.kind).toBe('onboarding');
    if (result.kind !== 'onboarding') throw new Error('Expected onboarding');
    expect(result.stage).toBe('verify-otp');
    expect(jwt.signAsync).toHaveBeenCalledWith(
      {
        sub: staffId,
        tokenUse: 'onboarding',
        stage: 'verify-otp',
      },
      { expiresIn: '15m' },
    );
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty('accessToken');
    expect(prisma.oTPs.upsert).toHaveBeenCalledTimes(1);
  });

  it('sends active staff with a required password change directly to that stage', async () => {
    const { service, prisma } = setup(StaffStatus.ACTIVE, true);
    expect(await service.signInHelper(credentials)).toEqual(
      expect.objectContaining({ kind: 'onboarding', stage: 'change-password' }),
    );
    expect(prisma.oTPs.upsert).not.toHaveBeenCalled();
  });

  it.each([StaffStatus.INACTIVE, StaffStatus.DELETED])(
    'rejects %s staff',
    async (status) => {
      const { service } = setup(status);
      await expect(service.signInHelper(credentials)).rejects.toThrow(
        UnauthorizedException,
      );
    },
  );

  it('rejects incorrect credentials before starting onboarding', async () => {
    const { service, prisma } = setup(StaffStatus.PENDING, true);
    await expect(
      service.signInHelper({ ...credentials, password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.oTPs.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unknown account', async () => {
    const { service, prisma } = setup();
    prisma.staffMembers.findUnique.mockResolvedValue(null);
    await expect(service.signInHelper(credentials)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('advances a verified pending account to password setup', async () => {
    const { service, prisma } = setup(StaffStatus.PENDING, true);
    const code = '123456';
    prisma.oTPs.findUnique.mockResolvedValue({
      id: 'test-otp',
      staffId,
      attempts: 0,
      codeHash: createHmac('sha256', secret).update(code).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(await service.verifyOnboardingOtp(staffId, code)).toEqual(
      expect.objectContaining({ kind: 'onboarding', stage: 'change-password' }),
    );
    expect(prisma.oTPs.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('keeps pending staff in onboarding after setting their password', async () => {
    const { service } = setup(StaffStatus.PENDING, true);
    const result = await service.changeOnboardingPassword(staffId, {
      newPassword: password,
      confirmPassword: password,
    });
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'onboarding',
        stage: 'complete-profile',
      }),
    );
    expect(result).not.toHaveProperty('accessToken');
  });

  it('finishes an active account password change without requiring profile onboarding', async () => {
    const { service, audit } = setup(StaffStatus.ACTIVE, true);
    const result = await service.changeOnboardingPassword(staffId, {
      newPassword: password,
      confirmPassword: password,
    });
    expect(result.kind).toBe('signed-in');
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('activates pending staff and issues a session after profile completion', async () => {
    const { service, prisma, audit } = setup(StaffStatus.PENDING, true);
    const result = await service.completePendingOnboarding(staffId, profile);
    expect(result.kind).toBe('signed-in');
    expect(prisma.staffMembers.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StaffStatus.ACTIVE,
          mustChangePassword: false,
        }) as unknown,
      }),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
