import { globalShortcut } from 'electron';

export interface ShortcutActions {
  toggleSession(): void;
  stopSession(): void;
  markCurrentKnown(): void;
  toggleOverlay(): void;
  toggleSearch(): void;
}

/**
 * Atalhos globais, que funcionam com o vídeo em tela cheia. `log` é temporário: mostra se o macOS
 * aceitou cada atalho e se o toque chegou até aqui, enquanto o ⌘⇧B é investigado.
 */
export function registerShortcuts(actions: ShortcutActions, log: (line: string) => void): void {
  const bindings: [string, () => void][] = [
    ['CommandOrControl+Shift+L', actions.toggleSession],
    ['CommandOrControl+Shift+E', actions.stopSession],
    ['CommandOrControl+Shift+K', actions.markCurrentKnown],
    ['CommandOrControl+Shift+H', actions.toggleOverlay],
    ['CommandOrControl+Shift+B', actions.toggleSearch],
  ];
  for (const [accelerator, action] of bindings) {
    const accepted = globalShortcut.register(accelerator, () => {
      log(`sistema: apertou ${accelerator}`);
      action();
    });
    log(`registro de ${accelerator}: ${accepted ? 'aceito' : 'RECUSADO'}`);
  }
}
