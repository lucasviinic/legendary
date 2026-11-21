import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const FRAMES = [
  ...['1a', '1b', '1c', '1d', '1e', '1f', '1g', '1h', '1i', '1j'],
  ...['2a', '2b', '2c', '2d', '2e'],
];
const designDir = resolve(import.meta.dirname, '../../../design');
const outputDir = join(designDir, 'reference');
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 2720, height: 3700 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(pathToFileURL(join(designDir, 'Legendary Mockups.dc.html')).href);
await page.locator(`[id="${FRAMES.at(-1)}"] .dv-card`).waitFor();
await page.setViewportSize({
  width: 2720,
  height: await page.evaluate('document.documentElement.scrollHeight'),
});
await page.waitForTimeout(500);
if (errors.length > 0) throw new Error(`O mockup tem erros: ${errors.join('; ')}`);

for (const frame of FRAMES) {
  const box = await page.locator(`[id="${frame}"] .dv-card`).boundingBox();
  await page.screenshot({
    path: join(outputDir, `${frame}.png`),
    animations: 'disabled',
    clip: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width),
      height: Math.round(box.height),
    },
  });
  console.log(`${frame}.png`);
}
await browser.close();
