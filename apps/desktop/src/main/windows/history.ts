import { app, BrowserWindow } from 'electron';
import { loadPage, normalWindowOptions } from './common';

let current: BrowserWindow | null = null;

export function openHistoryWindow(): void {
  if (current) {
    current.show();
    app.focus({ steal: true });
    return;
  }
  const window = new BrowserWindow({
    ...normalWindowOptions,
    width: 1100,
    height: 660,
    useContentSize: true,
    minWidth: 900,
    minHeight: 500,
    title: 'Histórico',
  });
  window.on('closed', () => {
    current = null;
  });
  window.once('ready-to-show', () => {
    window.show();
    app.focus({ steal: true });
  });
  loadPage(window, 'history');
  current = window;
}
