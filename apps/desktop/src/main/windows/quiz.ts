import { app, BrowserWindow } from 'electron';
import { loadPage, normalWindowOptions } from './common';

let current: BrowserWindow | null = null;

/** `triage` começa pela triagem das palavras: vale ao encerrar a sessão, não ao refazer o quiz. */
export function openQuizWindow(sessionId: number, { triage = false } = {}): void {
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
  loadPage(window, 'quiz', { sessionId: String(sessionId), ...(triage && { triage: '1' }) });
  current = window;
}
