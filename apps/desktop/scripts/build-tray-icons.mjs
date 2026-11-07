// Desenha os ícones da barra de menus a partir do glifo do frame 1d.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const SIZE = 22;
const outputDir = resolve(import.meta.dirname, '../resources/icons');
mkdirSync(outputDir, { recursive: true });

const glyph = (color, dot) => `
  <body style="margin:0;background:transparent">
    <div style="width:${SIZE}px;height:${SIZE}px;display:flex;align-items:center;justify-content:center">
      <span style="position:relative;width:17px;height:12px;border:1.5px solid ${color};border-radius:3px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:1.5px;padding-bottom:2px">
        <span style="width:9px;height:1.5px;background:${color};border-radius:1px"></span>
        <span style="width:6px;height:1.5px;background:${color};border-radius:1px"></span>
        ${dot ? '<span style="position:absolute;top:-3px;right:-3px;width:5px;height:5px;border-radius:50%;background:#FF453A"></span>' : ''}
      </span>
    </div>
  </body>`;

const ICONS = [
  ['trayTemplate', '#000', false],
  ['trayActiveLight', '#fff', true],
  ['trayActiveDark', '#000', true],
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, color, dot] of ICONS) {
  for (const scale of [1, 2]) {
    const page = await browser.newPage({
      viewport: { width: SIZE, height: SIZE },
      deviceScaleFactor: scale,
    });
    await page.setContent(glyph(color, dot));
    await page.screenshot({
      path: join(outputDir, `${name}${scale === 2 ? '@2x' : ''}.png`),
      omitBackground: true,
    });
    await page.close();
  }
}
await browser.close();
