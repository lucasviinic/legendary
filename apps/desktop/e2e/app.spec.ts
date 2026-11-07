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

  // Esconder o overlay vale até a pessoa mostrar de novo, mesmo com o status chegando a cada segundo.
  const overlayVisible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes('/overlay/'))!
        .isVisible(),
    );
  await expect.poll(overlayVisible).toBe(true);
  await invoke(menu, 'overlay:toggle');
  await expect.poll(overlayVisible).toBe(false);
  await menu.waitForTimeout(1_500);
  expect(await overlayVisible()).toBe(false);
  await invoke(menu, 'overlay:toggle');
  await expect.poll(overlayVisible).toBe(true);

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

  // A tradução chega logo depois, sem esperar outras palavras. A explicação vem em seguida.
  await expect(firstCard).toContainText('tradução de head out', { timeout: 2_000 });
  await expect(firstCard).toContainText('Explicação curta de head out', { timeout: 2_000 });

  // A palavra que espera a vez já foi traduzida: o card dela aparece pronto.
  const secondCard = overlay.getByTestId('card-reckon');
  await expect(secondCard).toBeVisible({ timeout: 20_000 });
  await expect(secondCard).toContainText('tradução de reckon', { timeout: 200 });
  await expect(overlay.getByTestId('status-bar')).toContainText('2 palavras novas');

  // O card anterior continua na pilha, resumido.
  await expect(firstCard).toContainText('tradução de head out');
  await expect(firstCard).not.toContainText('Explicação curta');

  // Salvar pelo card.
  await invoke(menu, 'vocab:save', { lemma: 'reckon' });

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

test('the cards can be dragged anywhere on the screen, and the position is remembered', async () => {
  const menu = await windowOf('menu');
  const overlay = await windowOf('overlay');

  if (!socket) {
    const view = (await invoke(menu, 'settings:get')) as { pairing: { token: string } };
    await connectExtension(view.pairing.token);
  }
  await invoke(menu, 'session:start', { source: 'browser' });
  sendCaption('He was a grumpy old man.');
  const stack = overlay.getByTestId('card-stack');
  const card = overlay.getByTestId('card-grumpy');
  await expect(card).toBeVisible();

  const box = async () => (await stack.boundingBox())!;
  const dragBy = async (x: number, y: number) => {
    const from = await box();
    await overlay.mouse.move(from.x + 30, from.y + 12);
    await overlay.mouse.down();
    await overlay.mouse.move(from.x + 30 + x, from.y + 12 + y, { steps: 6 });
    await overlay.mouse.up();
  };
  const placements = async () =>
    Object.values(
      ((await invoke(menu, 'settings:get')) as { settings: { cardPlacements: object } }).settings
        .cardPlacements,
    );

  // A janela cobre a tela inteira, mas a posição padrão continua abaixo da barra de menus.
  const geometry = await app.evaluate(({ BrowserWindow, screen }) => {
    const display = screen.getPrimaryDisplay();
    const overlayWindow = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('/overlay/'),
    )!;
    return {
      bounds: display.bounds,
      window: overlayWindow.getBounds(),
      safeTop: display.workArea.y - display.bounds.y,
      screenWidth: display.bounds.width,
    };
  });
  expect(geometry.window).toEqual(geometry.bounds);
  const start = await box();
  expect(start.y).toBe(geometry.safeTop + 20);
  expect(start.x + start.width).toBe(geometry.screenWidth - 20);
  const bar = (await overlay.getByTestId('status-bar').boundingBox())!;
  expect(bar.y).toBe(geometry.safeTop + 18);

  // Ao soltar, a pilha fica onde estava: não volta nem voa até a posição nova.
  // A medida é do card, porque é ele que a animação move, não a pilha em volta. Antes, espera o
  // card terminar de entrar, porque ele chega deslizando.
  await expect.poll(async () => (await card.boundingBox())!.x).toBe(start.x);
  await dragBy(-300, 40);
  for (let sample = 0; sample < 6; sample++) {
    const dropped = (await card.boundingBox())!;
    expect(dropped.x).toBeCloseTo(start.x - 300, 0);
    expect(dropped.y).toBeCloseTo(start.y + 40, 0);
    await overlay.waitForTimeout(40);
  }
  await expect.poll(placements).toEqual([{ corner: 'tr', x: 320, y: geometry.safeTop + 60 }]);

  // Chega até o topo da tela, acima da faixa da barra de menus, e não sai dela.
  await dragBy(0, -2_000);
  expect((await box()).y).toBe(0);
  await expect.poll(placements).toEqual([{ corner: 'tr', x: 320, y: 0 }]);

  // Um botão continua sendo botão. O card expande com o mouse em cima, como no frame 1c.
  await expect(card).toContainText('Explicação curta', { timeout: 2_000 });
  const save = card.getByRole('button', { name: 'Salvar' });
  await save.hover();
  await overlay.waitForTimeout(300);
  const before = await box();
  const saveBox = (await save.boundingBox())!;
  await overlay.mouse.move(saveBox.x + 5, saveBox.y + 5);
  await overlay.mouse.down();
  await overlay.mouse.move(saveBox.x + 60, saveBox.y + 60, { steps: 3 });
  await overlay.mouse.up();
  expect(await box()).toMatchObject({ x: before.x, y: before.y });

  // Um clique sem movimento não muda nada.
  const clickFrom = await box();
  await overlay.mouse.click(clickFrom.x + 30, clickFrom.y + 12);
  expect(await box()).toMatchObject({ x: clickFrom.x, y: clickFrom.y });
  await expect.poll(placements).toEqual([{ corner: 'tr', x: 320, y: 0 }]);

  // Na metade de baixo a pilha se prende ao canto de baixo e cresce para cima.
  const screenHeight = await overlay.evaluate(() => window.innerHeight);
  await dragBy(-600, screenHeight - 400);
  await expect.poll(async () => ((await placements())[0] as { corner: string }).corner).toBe('bl');
  const settings = (await invoke(menu, 'settings:get')) as { settings: { corner: string } };
  expect(settings.settings.corner).toBe('bl');

  // Escolher um canto nas Configurações volta para a posição padrão.
  await invoke(menu, 'settings:set', { corner: 'tr' });
  await expect.poll(async () => (await box()).y).toBe(geometry.safeTop + 20);
  await expect
    .poll(async () => {
      const { x, width } = await box();
      return x + width;
    })
    .toBe(geometry.screenWidth - 20);
  await expect.poll(placements).toEqual([]);
});

test('the cards per minute control reaches 6, in the four steps of the mockup', async () => {
  const menu = await windowOf('menu');
  await invoke(menu, 'window:open', { window: 'settings' });
  const isSettings = (window: Page) => window.url().includes('mode=settings');
  await expect.poll(() => app.windows().some(isSettings)).toBe(true);
  const settings = app.windows().find(isSettings)!;

  const saved = async () =>
    ((await invoke(menu, 'settings:get')) as { settings: { cardsPerMinute: number } }).settings
      .cardsPerMinute;
  const expectRate = async (rate: number) => {
    await expect(settings.getByText(`até ${rate}`, { exact: true })).toBeVisible();
    await expect.poll(saved).toBe(rate);
  };

  await settings.getByLabel('Cards por minuto').focus();
  await settings.keyboard.press('Home');
  await expectRate(1);
  await settings.keyboard.press('ArrowRight');
  await expectRate(2);
  await settings.keyboard.press('ArrowRight');
  await expectRate(4);
  await settings.keyboard.press('ArrowRight');
  await expectRate(6);
  await settings.keyboard.press('ArrowRight');
  await expectRate(6);

  // Quem salvou 3 antes desta mudança continua com 3, e o controle aparece no passo seguinte.
  await invoke(menu, 'settings:set', { cardsPerMinute: 3 });
  await expect(settings.getByText('até 3', { exact: true })).toBeVisible();
  await expect(settings.getByLabel('Cards por minuto')).toHaveValue('2');
});
