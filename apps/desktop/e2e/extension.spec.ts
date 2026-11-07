import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  _electron as electron,
  chromium,
  expect,
  test,
  type BrowserContext,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

const WS_PORT = 47697;
const EXTENSION = resolve(import.meta.dirname, '../../extension/.output/chrome-mv3');
const FIXTURE = resolve(import.meta.dirname, '../../extension/tests/fixtures/netflix.html');
const HIGHLIGHT = '[data-legendary-highlight]';

let app: ElectronApplication;
let browser: BrowserContext;
const folders: string[] = [];

const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'legendary-ext-'));
  folders.push(dir);
  return dir;
};

type ExtensionGlobals = { chrome: { storage: { local: { set(items: object): Promise<void> } } } };
type LooseApi = { legendary: { invoke(channel: string, payload: unknown): Promise<unknown> } };

const invoke = (page: Page, channel: string, payload?: unknown) =>
  page.evaluate(([name, body]) => (window as never as LooseApi).legendary.invoke(name, body), [
    channel,
    payload,
  ] as const);

async function windowOf(name: string): Promise<Page> {
  await expect
    .poll(() => app.windows().some((window) => window.url().includes(`/${name}/`)), {
      timeout: 20_000,
    })
    .toBe(true);
  return app.windows().find((window) => window.url().includes(`/${name}/`))!;
}

test.beforeAll(async () => {
  const { ELECTRON_RUN_AS_NODE, ...inherited } = process.env as Record<string, string>;
  app = await electron.launch({
    args: ['.'],
    cwd: resolve(import.meta.dirname, '..'),
    env: {
      ...inherited,
      LEGENDARY_E2E: '1',
      LEGENDARY_USER_DATA: tempDir(),
      LEGENDARY_WS_PORT: String(WS_PORT),
    },
  });
  browser = await chromium.launchPersistentContext(tempDir(), {
    channel: 'chromium',
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
});

test.afterAll(async () => {
  await browser?.close();
  await app?.close();
  folders.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

test('a caption on the page reaches the app and comes back underlined', async () => {
  const menu = await windowOf('menu');
  const overlay = await windowOf('overlay');
  const { pairing } = (await invoke(menu, 'settings:get')) as { pairing: { token: string } };
  await invoke(menu, 'settings:set', { onboarded: true });
  await invoke(menu, 'session:start', { source: 'browser' });

  // Cola o código no storage, como o popup faz, e espera a extensão conectar.
  const worker =
    browser.serviceWorkers()[0] ??
    (await browser.waitForEvent('serviceworker', { timeout: 20_000 }));
  await worker.evaluate(
    ([token, port]) =>
      (globalThis as never as ExtensionGlobals).chrome.storage.local.set({ token, port }),
    [pairing.token, WS_PORT] as const,
  );
  await expect
    .poll(
      async () =>
        ((await invoke(menu, 'settings:get')) as { pairing: { connected: boolean } }).pairing
          .connected,
      {
        timeout: 15_000,
      },
    )
    .toBe(true);

  // Uma página no endereço da Netflix, com a estrutura esperada, recebe o content script real.
  const page = await browser.newPage();
  await page.route('https://www.netflix.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><title>Netflix</title></head><body>${readFileSync(FIXTURE, 'utf8')}</body></html>`,
    }),
  );
  await page.goto('https://www.netflix.com/watch/1');

  // Uma legenda nova entra na página, como o player faz.
  await page.evaluate(() => {
    document.querySelector('.player-timedtext')!.innerHTML =
      '<span>I reckon we should head out before it gets dark.</span>';
  });

  // O card aparece no overlay do app.
  await expect(overlay.getByTestId('card-head out')).toBeVisible({ timeout: 15_000 });
  await expect(overlay.getByTestId('status-bar')).toContainText('Netflix');

  // E o destaque volta para a legenda, sem mudar o texto dela.
  await expect(page.locator(HIGHLIGHT)).toHaveText('head out', { timeout: 15_000 });
  await expect(page.locator('.player-timedtext')).toHaveText(
    'I reckon we should head out before it gets dark.',
  );
});
