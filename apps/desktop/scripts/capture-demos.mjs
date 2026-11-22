import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const DEMOS = { cards: 'cards.webp' };
const FPS = 30;
const SCALE = 1.5;
const EFFORT = 75;
const PORT = 5198;
const outputDir = resolve(import.meta.dirname, '../../../docs/screenshots');

const server = await createServer({
  configFile: resolve(import.meta.dirname, '../e2e/vite.preview.config.ts'),
  server: { port: PORT, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ channel: 'chrome' });

async function capture(demo, file) {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: SCALE,
  });
  await page.clock.install({ time: 0 });
  await page.goto(`http://localhost:${PORT}/preview/index.html?demo=${demo}`);
  const element = page.locator('[data-frame]');
  await element.waitFor();
  await page.waitForFunction(() => globalThis.demo !== undefined);
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.clock.pauseAt(60_000);
  const durationMs = await page.evaluate(() => {
    globalThis.demo.start();
    return globalThis.demo.durationMs;
  });

  const dir = mkdtempSync(join(tmpdir(), `legendary-${demo}-`));
  const frames = [];
  let now = 0;
  try {
    for (let index = 0; (index * 1000) / FPS < durationMs; index += 1) {
      const target = Math.round((index * 1000) / FPS);
      if (target > now) {
        await page.clock.runFor(target - now);
        await page.evaluate((delta) => globalThis.demo.advance(delta), target - now);
        now = target;
      }
      const path = join(dir, `${String(index).padStart(4, '0')}.png`);
      await element.screenshot({ path, omitBackground: true });
      frames.push(path);
    }
    const output = join(outputDir, file);
    execFileSync('img2webp', [
      '-loop',
      '0',
      '-lossless',
      '-q',
      String(EFFORT),
      '-m',
      '4',
      '-d',
      String(Math.round(1000 / FPS)),
      ...frames,
      '-o',
      output,
    ]);
    const megabytes = (statSync(output).size / 1_000_000).toFixed(1);
    console.log(`${file}: ${frames.length} quadros, ${megabytes} MB`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await page.close();
  }
}

try {
  for (const [demo, file] of Object.entries(DEMOS)) await capture(demo, file);
} finally {
  await browser.close();
  await server.close();
}
