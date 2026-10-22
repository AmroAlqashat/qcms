import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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
      }
    }

    return await this.prisma.settings.createMany({ data: changedSettings });
  }
}
