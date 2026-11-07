import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test';
import { WebSocket } from 'ws';

const WS_PORT = 47699;
const TITLE = 'Northbound · T1E3';

let app: ElectronApplication;
let userData: string;
let socket: WebSocket | null = null;
const highlights: unknown[] = [];
const rewinds: unknown[] = [];

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

/** Onde o elemento está depois de parar: duas leituras no mesmo quadro sempre dariam iguais. */
async function settledBox(locator: Locator) {
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  await expect
    .poll(async () => {
      boxes.push((await locator.boundingBox())!);
      const [previous, current] = boxes.slice(-2);
      return previous?.y === current?.y && previous?.height === current?.height;
    })
    .toBe(true);
  return boxes.at(-1)!;
}

async function connectExtension(token: string) {
  socket = new WebSocket(`ws://127.0.0.1:${WS_PORT}/?token=${token}`);
  await new Promise((resolve, reject) => {
    socket!.once('open', resolve);
    socket!.once('error', reject);
  });
  socket.on('message', (data) => {
    const message = JSON.parse(String(data)) as { type: string };
    if (message.type === 'highlight') highlights.push(message);
    if (message.type === 'rewind') rewinds.push(message);
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
    // Enquanto a tela não avança, a resposta anterior ainda vale e a tecla seria ignorada.
    await expect(next).toBeHidden();
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
  await expect(card.getByText('Outro exemplo')).toBeVisible();
  // O botão desce enquanto o card abre, e medir antes faria o clique cair fora dele.
  const saveBox = await settledBox(save);
  const before = await box();
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

test('the settings control the pace of the cards and how many summaries stay', async () => {
  const menu = await windowOf('menu');
  await invoke(menu, 'window:open', { window: 'settings' });
  const isSettings = (window: Page) => window.url().includes('mode=settings');
  await expect.poll(() => app.windows().some(isSettings)).toBe(true);
  const settings = app.windows().find(isSettings)!;

  const saved = async () =>
    (
      (await invoke(menu, 'settings:get')) as {
        settings: { cardsPerMinute: number; maxSummaries: number };
      }
    ).settings;

  const rate = settings.getByLabel('Cards por minuto');
  const expectRate = async (value: number, position: string) => {
    await expect(rate).toHaveAttribute('aria-valuetext', `até ${value}`);
    await expect(rate).toHaveValue(position);
    await expect.poll(async () => (await saved()).cardsPerMinute).toBe(value);
  };
  await rate.focus();
  await settings.keyboard.press('Home');
  await expectRate(1, '0');
  // O frame 1e desenha "até 2" em 33%, e essa posição não pode mudar.
  await settings.keyboard.press('ArrowRight');
  await expectRate(2, '33');
  for (const [value, position] of [
    [4, '46'],
    [6, '60'],
    [8, '73'],
    [10, '87'],
    [15, '100'],
    [15, '100'],
  ] as const) {
    await settings.keyboard.press('ArrowRight');
    await expectRate(value, position);
  }
  await settings.keyboard.press('ArrowLeft');
  await expectRate(10, '87');

  // Quem salvou 3 antes desta mudança continua com 3, e o controle aparece no passo seguinte.
  await invoke(menu, 'settings:set', { cardsPerMinute: 3 });
  await expect(settings.getByText('até 3', { exact: true })).toBeVisible();
  await expect(rate).toHaveValue('46');

  const summaries = settings.getByLabel('Resumos na tela');
  const expectSummaries = async (value: number) => {
    await expect(summaries).toHaveAttribute('aria-valuetext', `até ${value}`);
    await expect.poll(async () => (await saved()).maxSummaries).toBe(value);
  };
  await expectSummaries(6);
  await summaries.focus();
  await settings.keyboard.press('End');
  await expectSummaries(12);
  await settings.keyboard.press('ArrowLeft');
  await expectSummaries(11);
  await settings.keyboard.press('Home');
  await expectSummaries(1);
  await invoke(menu, 'settings:set', { maxSummaries: 6 });

  // O tempo de cada card começa em 10 s, e os cards por vez, em 1.
  const time = settings.getByLabel('Tempo de cada card');
  await expect(time).toHaveAttribute('aria-valuetext', '10 s');
  await time.focus();
  await settings.keyboard.press('Home');
  await expect(time).toHaveAttribute('aria-valuetext', '3 s');
  await settings.keyboard.press('ArrowRight');
  await expect(time).toHaveAttribute('aria-valuetext', '4 s');
  await settings.keyboard.press('End');
  await expect(time).toHaveAttribute('aria-valuetext', '30 s');
  await invoke(menu, 'settings:set', { cardSeconds: 10 });

  await settings.getByRole('button', { name: '2', exact: true }).click();
  await expect
    .poll(
      async () =>
        ((await invoke(menu, 'settings:get')) as { settings: { cardsAtOnce: number } }).settings
          .cardsAtOnce,
    )
    .toBe(2);
  await invoke(menu, 'settings:set', { cardsAtOnce: 1 });

  // Voltar o vídeo começa desligado e liga pelas Configurações.
  const rewind = settings.getByRole('switch', { name: 'Voltar o vídeo ao buscar' });
  await expect(rewind).toHaveAttribute('aria-checked', 'false');
  await rewind.click();
  await expect(rewind).toHaveAttribute('aria-checked', 'true');
  await rewind.click();
  await expect(rewind).toHaveAttribute('aria-checked', 'false');
});

test('a word typed in the search bar becomes a card, and can rewind the video', async () => {
  const menu = await windowOf('menu');
  const overlay = await windowOf('overlay');
  const search = await windowOf('search');
  const field = search.getByLabel('Buscar palavra');

  if (!socket) {
    const view = (await invoke(menu, 'settings:get')) as { pairing: { token: string } };
    await connectExtension(view.pairing.token);
  }
  const searchState = () =>
    app.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().find((item) =>
        item.webContents.getURL().includes('/search/'),
      )!;
      return {
        visible: window.isVisible(),
        focused: window.isFocused(),
        bounds: window.getBounds(),
        display: screen.getPrimaryDisplay().bounds,
      };
    });
  const searchVisible = async () => (await searchState()).visible;
  // Dois avisos seguidos do mesmo toque contam uma vez só, então um teste precisa dar um intervalo.
  const toggleSearch = async () => {
    await overlay.waitForTimeout(250);
    await app.evaluate(({ app: electronApp }) =>
      electronApp.emit('legendary:toggle-search' as never),
    );
  };

  expect(
    await app.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered('CommandOrControl+Shift+B'),
    ),
  ).toBe(true);

  // Sem sessão não há onde mostrar o card, e a barra abre avisando em vez de não fazer nada.
  await invoke(menu, 'session:stop');
  await toggleSearch();
  await expect.poll(searchVisible).toBe(true);
  await expect(field).toHaveAttribute('placeholder', /Inicie uma sessão/);
  await field.fill('knack');
  await field.press('Enter');
  await expect.poll(searchVisible).toBe(false);
  await expect(overlay.getByTestId('card-knack')).toHaveCount(0);

  await invoke(menu, 'session:start', { source: 'browser' });
  await invoke(menu, 'settings:set', { cardsPerMinute: 1, rewindOnSearch: false });
  sendCaption('She is wary of him.');
  const wary = overlay.getByTestId('card-wary');
  await expect(wary).toBeVisible();

  // A barra abre centralizada, em foco e acima do overlay, e a palavra entra sem esperar a vez.
  await toggleSearch();
  await expect.poll(searchVisible).toBe(true);
  const opened = await searchState();
  expect(opened.focused).toBe(true);
  expect(opened.bounds.x + opened.bounds.width / 2).toBeCloseTo(opened.display.width / 2, 0);
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('placeholder', 'Buscar palavra em inglês');

  // Um segundo aviso do mesmo toque, como o da extensão junto com o do sistema, não fecha a barra.
  await app.evaluate(({ app: electronApp }) =>
    electronApp.emit('legendary:toggle-search' as never),
  );
  await overlay.waitForTimeout(100);
  expect(await searchVisible()).toBe(true);

  await field.fill('knack');
  await field.press('Enter');
  await expect.poll(searchVisible).toBe(false);
  const knack = overlay.getByTestId('card-knack');
  await expect(knack).toContainText('tradução de knack', { timeout: 2_000 });
  await expect(knack).toContainText('Explicação curta de knack', { timeout: 2_000 });
  await expect(wary).not.toContainText('Explicação curta');
  await overlay.waitForTimeout(100);
  expect(rewinds).toEqual([]);

  // Esc fecha sem criar card, e o campo volta vazio.
  await toggleSearch();
  await expect.poll(searchVisible).toBe(true);
  await expect(field).toHaveValue('');
  await field.fill('hunch');
  await field.press('Escape');
  await expect.poll(searchVisible).toBe(false);
  await expect(overlay.getByTestId('card-hunch')).toHaveCount(0);

  // Enter com o campo vazio só fecha. O atalho também fecha a barra aberta.
  await toggleSearch();
  await expect.poll(searchVisible).toBe(true);
  await expect(field).toHaveValue('');
  await field.press('Enter');
  await expect.poll(searchVisible).toBe(false);
  await toggleSearch();
  await expect.poll(searchVisible).toBe(true);
  await toggleSearch();
  await expect.poll(searchVisible).toBe(false);

  // Com a opção ligada, a palavra volta o vídeo. Um texto sem palavra não.
  await invoke(menu, 'settings:set', { rewindOnSearch: true });
  await invoke(menu, 'search:submit', { query: '123' });
  await overlay.waitForTimeout(100);
  expect(rewinds).toEqual([]);
  await invoke(menu, 'search:submit', { query: 'hunch' });
  await expect.poll(() => rewinds).toEqual([{ type: 'rewind', seconds: 10 }]);

  // O card fica visível mesmo com o overlay escondido pelo atalho.
  await invoke(menu, 'overlay:toggle');
  await invoke(menu, 'search:submit', { query: 'grumpy' });
  await expect(overlay.getByTestId('card-grumpy')).toBeVisible();
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().includes('/overlay/'))!
        .isVisible(),
    ),
  ).toBe(true);

  // Baixar o limite tira os resumos mais antigos na hora.
  const cards = overlay.locator('[data-testid^="card-"]:not([data-testid="card-stack"])');
  await expect(cards).toHaveCount(4);
  await invoke(menu, 'settings:set', { maxSummaries: 1 });
  await expect(cards).toHaveCount(2);
  await invoke(menu, 'settings:set', { maxSummaries: 6, rewindOnSearch: false });

  // Encerrar a sessão fecha a barra.
  await toggleSearch();
  await expect.poll(searchVisible).toBe(true);
  await invoke(menu, 'session:stop');
  await expect.poll(searchVisible).toBe(false);
});

test('more than one card stays open when the settings allow it', async () => {
  const menu = await windowOf('menu');
  const overlay = await windowOf('overlay');
  if (!socket) {
    const view = (await invoke(menu, 'settings:get')) as { pairing: { token: string } };
    await connectExtension(view.pairing.token);
  }
  await invoke(menu, 'session:stop');
  await invoke(menu, 'settings:set', { cardsAtOnce: 2, cardsPerMinute: 10, cardSeconds: 3 });
  await invoke(menu, 'session:start', { source: 'browser' });

  sendCaption('A grumpy and wary man had a hunch.');
  await expect(overlay.getByText('Explicação curta')).toHaveCount(2, { timeout: 5_000 });

  await invoke(menu, 'settings:set', { cardsAtOnce: 1, cardSeconds: 10 });
  await invoke(menu, 'session:stop');
});

test('with every word on, one that comes back is only a summary with its count', async () => {
  const menu = await windowOf('menu');
  const overlay = await windowOf('overlay');
  if (!socket) {
    const view = (await invoke(menu, 'settings:get')) as { pairing: { token: string } };
    await connectExtension(view.pairing.token);
  }
  await invoke(menu, 'session:stop');
  await invoke(menu, 'settings:set', {
    translateAllWords: true,
    cardsPerMinute: 10,
    cardSeconds: 3,
  });
  await invoke(menu, 'session:start', { source: 'browser' });

  // Uma palavra comum, que o filtro de nível dispensaria, vira card e é traduzida.
  sendCaption('The table is here.');
  const table = overlay.getByTestId('card-table');
  await expect(table).toContainText('Explicação curta de table', { timeout: 5_000 });
  await expect(table).not.toContainText('Explicação curta', { timeout: 10_000 });
  await expect(table).not.toContainText('2x');

  // Quando ela volta, aparece só em resumo, com o contador.
  sendCaption('What a table.');
  await expect(table).toContainText('2x');
  await expect(table).toContainText('tradução de table');
  await expect(table).not.toContainText('Explicação curta');

  // Passar o mouse mostra o resto, como em qualquer resumo.
  await table.hover();
  await expect(table).toContainText('Explicação curta de table');
  await overlay.mouse.move(5, 5);

  await invoke(menu, 'settings:set', { translateAllWords: false, cardSeconds: 10 });
  await invoke(menu, 'session:stop');
});
