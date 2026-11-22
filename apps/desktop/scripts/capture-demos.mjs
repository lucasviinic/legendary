import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const DEMOS = {
  cards: { file: 'cards.webp', scale: 1.5 },
  search: { file: 'search.webp', scale: 1.5 },
  match: { file: 'quiz-match.webp', scale: 2 },
};
const FPS = 30;
const EFFORT = 75;
const PORT = 5198;
const outputDir = resolve(import.meta.dirname, '../../../docs/screenshots');

const requested = process.argv.slice(2);
const selected = requested.length > 0 ? requested : Object.keys(DEMOS);
const unknown = selected.filter((name) => !(name in DEMOS));
if (unknown.length > 0) throw new Error(`Demo desconhecida: ${unknown.join(', ')}`);

const server = await createServer({
  configFile: resolve(import.meta.dirname, '../e2e/vite.preview.config.ts'),
  server: { port: PORT, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ channel: 'chrome' });

async function capture(demo, { file, scale }) {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: scale,
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

  let pressed = false;
  const followPointer = async () => {
    const pointer = await page.evaluate(() => globalThis.demo.pointer());
    if (!pointer) return;
    await page.mouse.move(pointer.x, pointer.y);
    if (pointer.down === pressed) return;
    pressed = pointer.down;
    await (pressed ? page.mouse.down() : page.mouse.up());
  };

  const dir = mkdtempSync(join(tmpdir(), `legendary-${demo}-`));
  const frames = [];
  let now = 0;
  try {
    for (let index = 0; (index * 1000) / FPS < durationMs; index += 1) {
      const target = Math.round((index * 1000) / FPS);
      const delta = target - now;
      if (delta > 0) await page.clock.runFor(delta);
      await followPointer();
      if (delta > 0) await page.evaluate((ms) => globalThis.demo.advance(ms), delta);
      now = target;
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
  for (const demo of selected) await capture(demo, DEMOS[demo]);
} finally {
  await browser.close();
  await server.close();
}
