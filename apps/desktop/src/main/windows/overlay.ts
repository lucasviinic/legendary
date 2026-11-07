import { BrowserWindow, screen, type Display } from 'electron';
import { loadPage, secureWebPreferences } from './common';

/**
 * Janela transparente sobre o vídeo. A especificação previa `vibrancy: 'hud'`, mas vibrancy vale
 * para a janela inteira e embaçaria o vídeo todo, então o vidro é feito só com CSS nos cards.
 *
 * Ela cobre a tela inteira para os cards poderem ser arrastados até a borda de cima, que em tela
 * cheia é onde o vídeo começa. Sem `enableLargerThanScreen`, o macOS empurra a janela para baixo
 * da barra de menus.
 */
export class OverlayWindow {
  private window: BrowserWindow | null = null;
  private userHidden = false;
  private sessionActive = false;

  get current(): BrowserWindow | null {
    return this.window;
  }

  get display(): Display {
    return screen.getPrimaryDisplay();
  }

  create(onDisplayChange: () => void): void {
    const window = new BrowserWindow({
      ...this.display.bounds,
      enableLargerThanScreen: true,
      show: false,
      transparent: true,
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      type: 'panel',
      backgroundColor: '#00000000',
      webPreferences: secureWebPreferences,
    });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    window.setIgnoreMouseEvents(true, { forward: true });
    window.setContentProtection(true);
    window.on('closed', () => {
      this.window = null;
    });
    loadPage(window, 'overlay');
    this.window = window;

    const followDisplay = () => {
      this.window?.setBounds(this.display.bounds);
      onDisplayChange();
    };
    screen.on('display-metrics-changed', followDisplay);
    screen.on('display-added', followDisplay);
    screen.on('display-removed', followDisplay);
  }

  setInteractive(interactive: boolean): void {
    this.window?.setIgnoreMouseEvents(!interactive, { forward: true });
  }

  /** Chamado a cada atualização de status: só a virada de estado pode mexer na janela. */
  setSessionActive(active: boolean): void {
    if (active === this.sessionActive) return;
    this.sessionActive = active;
    if (active) this.userHidden = false;
    this.sync();
  }

  toggle(): void {
    this.userHidden = !this.userHidden;
    this.sync();
  }

  get hiddenByUser(): boolean {
    return this.userHidden;
  }

  private sync() {
    if (!this.window) return;
    if (this.sessionActive && !this.userHidden) this.window.showInactive();
    else this.window.hide();
  }
}
