import { app, BrowserWindow } from 'electron';
import { loadPage, normalWindowOptions } from './common';

let current: BrowserWindow | null = null;

export function openQuizWindow(sessionId: number): void {
  current?.close();
  const window = new BrowserWindow({
    ...normalWindowOptions,
    width: 760,
    height: 580,
    useContentSize: true,
    resizable: false,
    title: 'Quiz',
  });
  window.on('closed', () => {
    if (current === window) current = null;
  });
  window.once('ready-to-show', () => {
    window.show();
    app.focus({ steal: true });
  });
  loadPage(window, 'quiz', { sessionId: String(sessionId) });
  current = window;
}
