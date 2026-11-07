import { join } from 'node:path';
import { BrowserWindow, type WebPreferences } from 'electron';

export type RendererPage = 'overlay' | 'quiz' | 'history' | 'settings' | 'menu';

/** Toda janela usa estas opções: o renderer não tem acesso a Node nem ao main, só ao preload. */
export const secureWebPreferences: WebPreferences = {
  preload: join(import.meta.dirname, '../preload/index.cjs'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
};

export function loadPage(
  window: BrowserWindow,
  page: RendererPage,
  query: Record<string, string> = {},
): void {
  const { webContents } = window;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event) => event.preventDefault());

  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer) {
    const url = new URL(`${devServer}/${page}/index.html`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    void window.loadURL(url.toString());
  } else {
    void window.loadFile(join(import.meta.dirname, `../renderer/${page}/index.html`), { query });
  }
}

/** Opções das janelas normais: modo escuro nativo e semáforo na posição do mockup. */
export const normalWindowOptions = {
  show: false,
  backgroundColor: '#1e1e21',
  titleBarStyle: 'hiddenInset',
  trafficLightPosition: { x: 14, y: 13 },
  webPreferences: secureWebPreferences,
} as const;
