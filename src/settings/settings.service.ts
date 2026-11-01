import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsDto } from './dto/settings.dto';
import { NOTFOUND } from 'node:dns';
import { JsonValue } from '@prisma/client/runtime/library';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}
  private cache = new Map<string, { value: JsonValue; expiresAt: number }>();
  private readonly ttlMs = 60_000;
  private readonly defaultTimeOut = 30;

 private async get(key: string): Promise<JsonValue> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const row = await this.prisma.settings.findFirst({ where: { key } });
    if(!row)
      throw new NotFoundException('setting not found')
    const value = row.value;

    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  async getSessionTimeoutMinutes(): Promise<number> {
    const n = Number(await this.get('sessionTimeOut'));
    return Number.isFinite(n) && n > 0 ? n : Number(this.defaultTimeOut);
  }

  async getSettings() {
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

  async saveChanges(settingsDto: SettingsDto, actorId: string) {
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
    return await this.prisma.settings.createMany({ data: changedSettings });
  }

  async refresh(key?: string): Promise<void> {
  if (key) {
    this.cache.delete(key);
    await this.get(key); // re-read now so the next caller hits a warm cache
  } else {
    const keys = [...this.cache.keys()];
    this.cache.clear();
    await Promise.all(keys.map((k) => this.get(k)));
  }
}
}
