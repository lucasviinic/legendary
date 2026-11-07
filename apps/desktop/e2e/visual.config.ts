import { defineConfig } from '@playwright/test';

/** Compara cada tela com o PNG do frame do mockup em `design/reference`. */
export default defineConfig({
  testDir: '.',
  testMatch: 'visual.spec.ts',
  outputDir: '../test-results/visual',
  snapshotPathTemplate: '../../../design/reference/{arg}{ext}',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5199',
    channel: 'chrome',
    deviceScaleFactor: 1,
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: 'pnpm vite --config vite.preview.config.ts',
    url: 'http://localhost:5199/preview/index.html',
    reuseExistingServer: true,
  },
});
