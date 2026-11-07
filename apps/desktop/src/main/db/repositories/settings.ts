import { eq } from 'drizzle-orm';
import { settings } from '@legendary/db';
import type { Db } from '../client';

export function settingsRepository(db: Db) {
  return {
    get(key: string): unknown {
      const row = db.select().from(settings).where(eq(settings.key, key)).get();
      return row ? JSON.parse(row.valueJson) : undefined;
    },
    set(key: string, value: unknown) {
      const valueJson = JSON.stringify(value);
      db.insert(settings)
        .values({ key, valueJson })
        .onConflictDoUpdate({ target: settings.key, set: { valueJson } })
        .run();
    },
  };
}

export type SettingsRepository = ReturnType<typeof settingsRepository>;
