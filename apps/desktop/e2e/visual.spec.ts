import { expect, test } from '@playwright/test';

const FRAMES = [
  ...['1a', '1b', '1c', '1d', '1e', '1f', '1g', '1h', '1i', '1j'],
  ...['2a', '2b', '2c', '2d', '2e'],
];

const MAX_DIFF_RATIO = 0.005;

for (const frame of FRAMES) {
  test(`frame ${frame} matches the mockup`, async ({ page }) => {
    await page.goto(`/preview/index.html?frame=${frame}`);
    const element = page.locator('[data-frame]');
    await element.waitFor();
    await page.waitForTimeout(400);
    await expect(element).toHaveScreenshot(`${frame}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: MAX_DIFF_RATIO,
      threshold: 0.2,
    });
  });
}
