import { globalShortcut } from 'electron';

export interface ShortcutActions {
  toggleSession(): void;
  stopSession(): void;
  markCurrentKnown(): void;
  toggleOverlay(): void;
  toggleSearch(): void;
}

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
