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
import { WebSocket } from 'ws';

const WS_PORT = 47699;
const TITLE = 'Northbound · T1E3';

let app: ElectronApplication;
let userData: string;
let socket: WebSocket | null = null;
const highlights: unknown[] = [];

/** As janelas ficam em memória mesmo escondidas: procura pela página de cada uma. */
async function windowOf(page: string): Promise<Page> {
  await expect
    .poll(() => app.windows().some((window) => window.url().includes(`/${page}/`)), {
      timeout: 20_000,
    })
    .toBe(true);
  return app.windows().find((window) => window.url().includes(`/${page}/`))!;
}

type LooseApi = { legendary: { invoke(channel: string, payload: unknown): Promise<unknown> } };

const invoke = (page: Page, channel: string, payload?: unknown) =>
  page.evaluate(([name, body]) => (window as never as LooseApi).legendary.invoke(name, body), [
    channel,
    payload,
  ] as const);

async function connectExtension(token: string) {
  socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}/?token=${token}`);
  await new Promise((resolve, reject) => {
    socket!.once('open', resolve);
    socket!.once('error', reject);
  });
  socket.on('message', (data) => {
    const message = JSON.parse(String(data)) as { type: string };
    if (message.type === 'highlight') highlights.push(message);
  });
}

function sendCaption(text: string) {
  socket!.send(
    JSON.stringify({
      type: 'caption',
      caption: { text, startedAt: Date.now(), source: 'netflix', mediaTitle: TITLE },
    }),
  );
}

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'legendary-e2e-'));
  // Quem roda dentro do VS Code herda esta variável, que faria o Electron subir como Node.
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
  socket?.terminate();
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

test('first run asks for the setup', async () => {
  const onboarding = await windowOf('settings');
  expect(onboarding.url()).toContain('mode=onboarding');
  await expect(onboarding.getByText('Vamos configurar o Legendary')).toBeVisible();
  await expect(onboarding.getByRole('button', { name: 'Começar' })).toBeDisabled();
});

test('rejects a WebSocket without the token', async () => {
  const rejected = await new Promise<boolean>((resolve) => {
    const intruder = new WebSocket(`ws://127.0.0.1:${WS_PORT}/?token=wrong`);
    intruder.once('open', () => resolve(false));
    intruder.once('error', () => resolve(true));
  });
  expect(rejected).toBe(true);
});

test('never exposes Node or the API key to a window', async () => {
  const overlay = await windowOf('overlay');
  const globals = await overlay.evaluate(() => ({
    require: typeof (window as never as { require?: unknown }).require,
    process: typeof (window as never as { process?: unknown }).process,
  }));
  expect(globals).toEqual({ require: 'undefined', process: 'undefined' });
});

test('captions become cards, and the session ends in a quiz and in the history', async () => {
  const menu = await windowOf('menu');
  const overlay = await windowOf('overlay');

  const view = (await invoke(menu, 'settings:get')) as { pairing: { token: string } };
  await connectExtension(view.pairing.token);
  await invoke(menu, 'settings:set', { cardsPerMinute: 4, level: 'B2', onboarded: true });
  await invoke(menu, 'session:start', { source: 'browser' });

  // A barra de status aparece com a sessão ativa.
  await expect(overlay.getByTestId('status-bar')).toContainText('Encerrar');

  // A legenda gera um card, primeiro sem tradução.
  sendCaption('JOHN: I reckon we should head out before it gets dark.');
  const firstCard = overlay.getByTestId('card-head out');
  await expect(firstCard).toContainText('phrasal verb');
  await expect(overlay.getByTestId('status-bar')).toContainText('1 palavra nova');
  await expect
    .poll(() => highlights)
    .toContainEqual({
      type: 'highlight',
      text: 'JOHN: I reckon we should head out before it gets dark.',
      surfaces: ['head out'],
    });

  // A tradução chega depois, pela fila da IA.
  await expect(firstCard).toContainText('tradução de head out', { timeout: 15_000 });

  // O próximo card respeita o limite por minuto e empurra o anterior para baixo.
  sendCaption('I reckon that is right.');
  const secondCard = overlay.getByTestId('card-reckon');
  await expect(secondCard).toBeVisible({ timeout: 20_000 });
  await expect(overlay.getByTestId('status-bar')).toContainText('2 palavras novas');

  // Salvar pelo card.
  await invoke(menu, 'vocab:save', { lemma: 'reckon' });

  // Espera a tradução para a palavra entrar no quiz.
  await expect(secondCard).toContainText('tradução de reckon', { timeout: 15_000 });

  // Encerrar abre o quiz com o resumo da sessão.
  const quizOpened = app.waitForEvent('window', (window) => window.url().includes('/quiz/'));
  await invoke(menu, 'session:stop');
  const quiz = await quizOpened;
  await expect(quiz.getByText('Sessão encerrada')).toBeVisible();
  await expect(quiz.getByText(TITLE)).toBeVisible();
  await expect(quiz.getByRole('checkbox')).toHaveCount(2);

  await quiz.getByRole('button', { name: /Começar quiz/ }).click();

  // Responde cada questão até a tela final.
  for (let guard = 0; guard < 12; guard++) {
    if (
      await quiz
        .getByText('Para revisar')
        .or(quiz.getByText('Nenhum erro nesta rodada.'))
        .isVisible()
    )
      break;
    const next = quiz.getByRole('button', { name: /Próxima/ });
    await expect(quiz.getByText(/\d+ de \d+/).first()).toBeVisible();
    const typed = quiz.getByLabel('Sua resposta');
    if (await typed.isVisible()) {
      await typed.fill('head out');
      await typed.press('Enter');
    } else {
      await quiz.keyboard.press('1');
    }
    await expect(next).toBeVisible();
    await next.click();
    await quiz.waitForTimeout(100);
  }
  await expect(quiz.getByRole('button', { name: 'Fechar' })).toBeVisible();

  // O histórico mostra a sessão e as palavras.
  const historyOpened = app.waitForEvent('window', (window) => window.url().includes('/history/'));
  await quiz.getByRole('button', { name: 'Ver histórico' }).click();
  const history = await historyOpened;
  await expect(history.getByRole('button', { name: new RegExp(TITLE) })).toBeVisible();
  const row = history.getByTestId('history-row-reckon');
  await expect(row).toContainText('tradução de reckon');
  await expect(row).toContainText('★');
  await expect(row).toContainText('B2');

  // A barra some quando a sessão acaba.
  await expect(overlay.getByTestId('status-bar')).toHaveCount(0);
});
