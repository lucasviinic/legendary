import { globalShortcut } from 'electron';

export interface ShortcutActions {
  toggleSession(): void;
  stopSession(): void;
  markCurrentKnown(): void;
  toggleOverlay(): void;
  toggleSearch(): void;
}

/** Atalhos globais, que funcionam com o vídeo em tela cheia. */
export function registerShortcuts(actions: ShortcutActions): void {
  globalShortcut.register('CommandOrControl+Shift+L', actions.toggleSession);
  globalShortcut.register('CommandOrControl+Shift+E', actions.stopSession);
  globalShortcut.register('CommandOrControl+Shift+K', actions.markCurrentKnown);
  globalShortcut.register('CommandOrControl+Shift+H', actions.toggleOverlay);
  globalShortcut.register('CommandOrControl+Shift+B', actions.toggleSearch);
}
