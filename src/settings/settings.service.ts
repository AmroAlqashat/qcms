import { ForbiddenException, Injectable } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}
  private cache = new Map<string, { value: number; expiresAt: number }>();
  private readonly ttlMs = 60_000;
  private readonly defaultTimeOut = 30;

  private assertActorEndpointCenterWideScope(
    actorEndpointPermissionScope: ScopeType,
  ): void {
    if (actorEndpointPermissionScope !== ScopeType.CENTER_WIDE) {
      throw new ForbiddenException(
        'يتطلب هذا الإجراء صلاحية إدارة الإعدادات على مستوى المركز',
      );
    }
  }

  async getSessionTimeoutMinutes(): Promise<number> {
    const key = 'sessionInactivityTimeoutMinutes';
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const row = await this.prisma.settings.findFirst({
      where: { key },
      orderBy: [{ setAt: 'desc' }, { id: 'desc' }],
    });
    if (!row) return this.defaultTimeOut;

    const minutes =
      typeof row.value === 'number' || typeof row.value === 'string'
        ? Number(row.value)
        : NaN;
    const value =
      Number.isInteger(minutes) && minutes >= 1 && minutes <= 43_200
        ? minutes
        : this.defaultTimeOut;
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  async getSettings(actorEndpointPermissionScope: ScopeType) {
    this.assertActorEndpointCenterWideScope(actorEndpointPermissionScope);
    const settings = await this.prisma.settings.findMany({
      distinct: ['key'],
      orderBy: [{ setAt: 'desc' }, { id: 'desc' }],
      select: {
        key: true,
        value: true,
        setAt: true,
      },
    });

    const settingsObject = Object.fromEntries(
      settings.map((setting) => [setting.key, setting]),
    );

    return settingsObject;
  }

  async saveChanges(
    settingsDto: SettingsDto,
    actorId: string,
    actorEndpointPermissionScope: ScopeType,
  ) {
    this.assertActorEndpointCenterWideScope(actorEndpointPermissionScope);
    // Fetch current settings.
    const dbSettings = await this.prisma.settings.findMany({
      distinct: ['key'],
      orderBy: [{ setAt: 'desc' }, { id: 'desc' }],
      select: { key: true, value: true },
    });

    // Convert the submitted settings to an array of key/value objects.
    const newSettings = Object.entries(settingsDto).map(([key, value]) => ({
      key,
      value: value as string | number | boolean,
    }));

    const changedSettings: {
      key: string;
      value: string | number | boolean;
      setById: string;
    }[] = [];

    // Store only changed settings whose keys already exist in the database.
    for (const dbSetting of dbSettings) {
      for (const newSetting of newSettings) {
        if (dbSetting.key !== newSetting.key) continue;
        if (dbSetting.value === newSetting.value) continue;

        changedSettings.push({
          key: newSetting.key,
          value: newSetting.value,
          setById: actorId,
        });
        this.cache.delete(dbSetting.key);
      }
    }
    return this.prisma.settings.createMany({ data: changedSettings });
  }

  async refresh(key?: string): Promise<void> {
    const timeoutKey = 'sessionInactivityTimeoutMinutes';
    if (key && key !== timeoutKey) return;
    this.cache.delete(timeoutKey);
    await this.getSessionTimeoutMinutes();
  }
}
