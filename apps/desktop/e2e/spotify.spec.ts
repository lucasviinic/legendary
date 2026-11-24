import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

const WS_PORT = 47693;

let app: ElectronApplication;
let userData: string;

type LooseApi = { legendary: { invoke(channel: string, payload: unknown): Promise<unknown> } };

const invoke = (page: Page, channel: string, payload?: unknown) =>
  page.evaluate(([name, body]) => (window as never as LooseApi).legendary.invoke(name, body), [
    channel,
    payload,
  ] as const);

async function windowOf(page: string): Promise<Page> {
  await expect
    .poll(() => app.windows().some((window) => window.url().includes(`/${page}/`)), {
      timeout: 20_000,
    })
    .toBe(true);
  return app.windows().find((window) => window.url().includes(`/${page}/`))!;
}

const play = (state: object) =>
  app.evaluate(({ app: electronApp }, payload) => {
    electronApp.emit('legendary:spotify' as never, payload);
  }, state);

const track = (id: string, name: string) => ({
  kind: 'track',
  id,
  name,
  artist: 'The Fakes',
  album: 'Fakes',
  durationMs: 180_000,
  positionS: 0,
  playing: true,
});

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'legendary-spotify-'));
  const { ELECTRON_RUN_AS_NODE, ...inherited } = process.env as Record<string, string>;
  app = await electron.launch({
    args: ['.'],
    cwd: resolve(import.meta.dirname, '..'),
    env: {
      ...inherited,
      LEGENDARY_E2E: '1',
      LEGENDARY_USER_DATA: userData,
      LEGENDARY_WS_PORT: String(WS_PORT),
    },
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

test('Spotify lyrics become cards, one session per song, with the quiz of the last song', async () => {
  const menu = await windowOf('menu');
  const overlay = await windowOf('overlay');
  const bar = overlay.getByTestId('status-bar');
  await invoke(menu, 'settings:set', { onboarded: true, cardsPerMinute: 15, cardsAtOnce: 3 });
  const origin = async () =>
    ((await invoke(menu, 'settings:get')) as { settings: { origin: string } }).settings.origin;

  await menu.getByRole('button', { name: /Spotify/ }).click();
  await expect.poll(origin).toBe('spotify');
  await invoke(menu, 'session:start', { source: 'spotify' });
  await expect(menu.getByRole('button', { name: /Navegador/ })).toBeDisabled();
  await expect(bar).toContainText('Abra o Spotify e dê play');

  await play({ kind: 'denied' });
  await expect(bar).toContainText('Libere o controle do Spotify');

  await play(track('spotify:track:1', 'Northern Hunch'));
  await expect(overlay.getByTestId('card-hunch')).toBeVisible({ timeout: 10_000 });
  await expect(overlay.getByTestId('card-grumpy')).toBeVisible({ timeout: 10_000 });
  await expect(bar).toContainText('Encerrar');
  await expect(bar).toContainText('Spotify');

  await play(track('spotify:track:2', 'No Words'));
  await expect(bar).toContainText('Música sem letra em inglês');

  await play(track('spotify:track:3', 'Wary Heart'));
  await expect(overlay.getByTestId('card-wary')).toBeVisible({ timeout: 10_000 });

  const quizOpened = app.waitForEvent('window', (window) => window.url().includes('/quiz/'));
  await invoke(menu, 'session:stop');
  const quiz = await quizOpened;
  const sessionId = Number(new URL(quiz.url()).searchParams.get('sessionId'));
  const list = (await invoke(menu, 'history:list')) as {
    sessions: { id: number; title: string; source: string }[];
  };
  expect(list.sessions.map(({ title }) => title)).toEqual([
    'Wary Heart · The Fakes',
    'Northern Hunch · The Fakes',
  ]);
  expect(list.sessions[0]).toMatchObject({ id: sessionId, source: 'spotify' });
  await expect(menu.getByRole('button', { name: /Navegador/ })).toBeEnabled();
  await menu.getByRole('button', { name: /Navegador/ }).click();
  await expect.poll(origin).toBe('browser');
});
