import { join } from 'node:path';
import { app } from 'electron';

export const resourcesDir = (): string =>
  app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');

export const migrationsDir = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(app.getAppPath(), '../../packages/db/migrations');
