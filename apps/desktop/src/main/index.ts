import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';
import type { CaptionEvent, Provider, SettingsView } from '@legendary/contracts';
import { createPipeline, createWordLookup } from '@legendary/core/pipeline';
import { fakeProvider } from './ai/fake-provider';
import { createProvider } from './ai/provider-factory';
import type { LLMProvider } from './ai/types';
import { setApplicationMenu } from './app/app-menu';
import { registerShortcuts } from './app/shortcuts';
import { AppTray } from './app/tray';
import { ExtensionSource } from './capture/ws-server';
import { openDatabase } from './db/client';
import { createRepositories } from './db/repositories';
import { broadcast, registerHandlers } from './ipc/handlers';
import { migrationsDir, resourcesDir } from './paths';
import { HistoryService } from './services/history';
import { loadLexicon } from './services/lexicon';
import { QuizService } from './services/quiz';
import { createSafeStorageSecrets } from './services/secrets-electron';
import { SessionService } from './services/session';
import { SettingsService } from './services/settings';
import { VocabularyService } from './services/vocabulary';
import { openHistoryWindow } from './windows/history';
import { MenuWindow } from './windows/menu';
import { OverlayWindow } from './windows/overlay';
import { displayKey, overlayLayout } from './windows/overlay-layout';
import { openQuizWindow } from './windows/quiz';
import { SearchWindow } from './windows/search';
import { openSettingsWindow } from './windows/settings';

const STATUS_TICK_MS = 1_000;
const REWIND_SECONDS = 10;
/** Só os testes ponta a ponta usam isto, e nunca no app empacotado. */
const isE2E = !app.isPackaged && process.env.LEGENDARY_E2E === '1';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32LE(0) % (i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function configurePaths() {
  app.setName('Legendary');
  const userData = process.env.LEGENDARY_USER_DATA;
  app.setPath(
    'userData',
    !app.isPackaged && userData ? userData : join(app.getPath('appData'), 'Legendary'),
  );
}

async function bootstrap() {
  nativeTheme.themeSource = 'dark';
  app.dock?.hide();

  const userData = app.getPath('userData');
  const { db, close } = openDatabase(join(userData, 'legendary.db'), migrationsDir());
  const repos = createRepositories(db);
  const secrets = createSafeStorageSecrets(join(userData, 'secrets.json'));
  const settings = new SettingsService({ repo: repos.settings, secrets });

  const providers = new Map<string, LLMProvider>();
  const getProvider = (): LLMProvider | null => {
    if (isE2E) return fakeProvider;
    const { provider } = settings.get();
    const key = settings.apiKey(provider);
    if (!key) return null;
    const cacheKey = `${provider}:${key}`;
    let instance = providers.get(cacheKey);
    if (!instance) {
      instance = createProvider(provider, key);
      providers.clear();
      providers.set(cacheKey, instance);
    }
    return instance;
  };

  const source = new ExtensionSource({
    token: settings.pairingToken(),
    port: Number(process.env.LEGENDARY_WS_PORT) || settings.get().wsPort,
  });
  try {
    await source.start();
  } catch (error) {
    console.error('Não foi possível abrir o WebSocket local:', error);
  }

  const now = () => Date.now();
  const lexicon = loadLexicon(resourcesDir());
  const vocabulary = new VocabularyService({
    repos,
    pipeline: createPipeline(lexicon),
    lookup: createWordLookup(lexicon),
    settings,
    getProvider,
    now,
    emit: {
      card: (card) => broadcast('vocab:card', card),
      cardUpdate: (card) => broadcast('vocab:card-update', card),
      cardSeen: (card) => broadcast('vocab:card-seen', card),
      cardRemove: (lemma) => broadcast('vocab:card-remove', { lemma }),
      highlight: (text, surfaces) => source.sendHighlight(text, surfaces),
    },
  });

  const overlay = new OverlayWindow();
  const menu = new MenuWindow();
  const searchBar = new SearchWindow();

  let tray: AppTray | null = null;
  const session = new SessionService({
    repos,
    vocabulary,
    now,
    emitStatus: (status) => {
      broadcast('session:status', status);
      overlay.setSessionActive(status.state !== 'idle');
      tray?.setActive(status.state !== 'idle');
      if (status.state === 'idle') searchBar.hide();
    },
  });
  const quiz = new QuizService({ repos, getProvider, now, shuffle });
  const history = new HistoryService({ repos, now });

  const settingsView = (): SettingsView => ({
    settings: settings.get(),
    keys: settings.keyInfo(),
    pairing: { token: settings.pairingToken(), port: source.port, connected: source.connected },
  });
  const publishSettings = () => broadcast('settings:changed', settingsView());
  const currentLayout = () => overlayLayout(settings.get(), overlay.display);
  const publishLayout = () => broadcast('overlay:layout', currentLayout());
  settings.onChange(publishSettings);
  settings.onChange(publishLayout);
  source.on('connection-change', publishSettings);
  source.on('caption', (caption: CaptionEvent) => session.handleCaption(caption));

  const checkKey = async (provider: Provider) => {
    const key = settings.apiKey(provider);
    if (!key) return;
    try {
      await (isE2E ? fakeProvider : createProvider(provider, key)).check();
      settings.setKeyStatus(provider, 'ok');
    } catch {
      settings.setKeyStatus(provider, 'invalid');
    }
  };

  const stopSession = async () => {
    const sessionId = await session.stop();
    if (sessionId !== null) openQuizWindow(sessionId);
  };
  const toggleSession = () => {
    if (session.status().state === 'idle') session.start(settings.get().origin);
    else session.togglePause();
  };

  const toggleOverlay = () => {
    overlay.toggle();
    broadcast('overlay:visibility', { visible: !overlay.hiddenByUser });
  };
  const logShortcut = (line: string) =>
    appendFileSync(join(userData, 'shortcuts.log'), `${new Date().toISOString()} ${line}\n`);
  const toggleSearch = () => {
    logShortcut(`barra de busca: sessão ${session.status().state}`);
    searchBar.toggle(overlay.display);
  };
  source.on('open-search', () => {
    logShortcut('extensão: apertou o atalho no player');
    toggleSearch();
  });
  const searchWord = (query: string) => {
    searchBar.hide();
    if (!session.search(query)) return;
    if (overlay.hiddenByUser) toggleOverlay();
    if (settings.get().rewindOnSearch) source.sendRewind(REWIND_SECONDS);
  };

  registerHandlers({
    'session:start': ({ source: origin }) => session.start(origin),
    'session:stop': () => stopSession(),
    'session:toggle-pause': () => session.togglePause(),
    'session:get-status': () => session.status(),
    'vocab:mark-known': ({ lemma }) => vocabulary.markKnown(lemma),
    'vocab:save': ({ lemma }) => ({ saved: vocabulary.toggleSaved(lemma) }),
    'overlay:set-interactive': ({ interactive }) => overlay.setInteractive(interactive),
    'overlay:toggle': toggleOverlay,
    'overlay:get-layout': () => currentLayout(),
    'overlay:set-placement': (placement) =>
      settings.placeCards(displayKey(overlay.display), placement),
    'search:submit': ({ query }) => searchWord(query),
    'search:hide': () => searchBar.hide(),
    'quiz:summary': ({ sessionId }) => quiz.summary(sessionId),
    'quiz:get': ({ sessionId, senseIds }) => quiz.create(sessionId, senseIds),
    'quiz:review-mistakes': ({ quizId }) => quiz.reviewMistakes(quizId),
    'quiz:answer': ({ questionId, answer }) => quiz.answer(questionId, answer),
    'quiz:finish': ({ quizId }) => quiz.finish(quizId),
    'quiz:open': ({ sessionId }) => openQuizWindow(sessionId),
    'history:list': () => history.list(),
    'history:words': (request) => history.words(request),
    'settings:get': () => settingsView(),
    'settings:set': (patch) => {
      settings.update(patch);
      return settingsView();
    },
    'settings:set-api-key': ({ provider, key }) => {
      settings.setApiKey(provider, key);
      void checkKey(provider);
      return settingsView();
    },
    'window:open': ({ window }) => {
      menu.hide();
      if (window === 'history') openHistoryWindow();
      else openSettingsWindow(window);
    },
    'window:close-current': (_request, sender) => BrowserWindow.fromWebContents(sender)?.close(),
    'window:set-content-height': ({ height }, sender) => {
      const window = BrowserWindow.fromWebContents(sender);
      if (!window) return;
      const [width = 0] = window.getContentSize();
      window.setContentSize(width, Math.ceil(height));
    },
    'menu:hide': () => menu.hide(),
    'app:quit': () => app.quit(),
  });

  setApplicationMenu(() => openSettingsWindow());
  registerShortcuts(
    {
      toggleSession,
      stopSession: () => void stopSession(),
      markCurrentKnown: () => vocabulary.markCurrentKnown(),
      toggleOverlay,
      toggleSearch,
    },
    logShortcut,
  );
  // Um teste não consegue apertar um atalho global do sistema.
  if (isE2E) app.on('legendary:toggle-search' as never, toggleSearch);

  overlay.create(publishLayout);
  menu.create();
  searchBar.create();
  tray = new AppTray(join(resourcesDir(), 'icons'), (bounds) => menu.toggle(bounds));

  const ticker = setInterval(() => session.tick(), STATUS_TICK_MS);
  app.on('will-quit', () => {
    clearInterval(ticker);
    void source.stop();
    close();
  });

  if (!settings.get().onboarded) openSettingsWindow('onboarding');
}

configurePaths();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Sem esta espera por janelas, fechar o quiz encerraria um app que vive na barra de menus.
  app.on('window-all-closed', () => undefined);
  void app.whenReady().then(bootstrap);
}
