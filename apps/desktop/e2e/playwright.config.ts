import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['app.spec.ts', 'extension.spec.ts'],
  outputDir: '../test-results/e2e',
  reporter: 'list',
  timeout: 120_000,
  workers: 1,
});
