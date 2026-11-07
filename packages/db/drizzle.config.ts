import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { defineConfig } from 'drizzle-kit';

const url =
  process.env.LEGENDARY_DB ?? join(homedir(), 'Library/Application Support/Legendary/legendary.db');
mkdirSync(dirname(url), { recursive: true });

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: { url },
});
