import { app, BrowserWindow } from 'electron';
import { loadPage, normalWindowOptions } from './common';

const WIDTH = 560;
let current: BrowserWindow | null = null;
let currentMode: 'settings' | 'onboarding' | null = null;

/** A primeira execução usa a mesma página, porque não há frame próprio para ela no mockup. */
export function openSettingsWindow(mode: 'settings' | 'onboarding' = 'settings'): void {
  if (current && currentMode === mode) {
    current.show();
    app.focus({ steal: true });
    return;
  }
  current?.close();

  const window = new BrowserWindow({
    ...normalWindowOptions,
    width: WIDTH,
    height: 420,
    useContentSize: true,
    resizable: false,
    title: mode === 'settings' ? 'Configurações' : 'Legendary',
  });
  window.on('closed', () => {
    if (current === window) {
      current = null;
      currentMode = null;
    }
  });
  window.once('ready-to-show', () => {
    window.show();
    app.focus({ steal: true });
  });
  loadPage(window, 'settings', { mode });
  current = window;
  currentMode = mode;
}
