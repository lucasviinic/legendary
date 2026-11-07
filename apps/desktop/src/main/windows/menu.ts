import { BrowserWindow, type Rectangle } from 'electron';
import { loadPage, secureWebPreferences } from './common';

/** 300 de conteúdo mais a borda de 1px de cada lado, como no frame 1d. */
const WIDTH = 302;
const GAP_BELOW_TRAY = 4;
/** Clicar no ícone com o menu aberto fecha pelo blur, e esse mesmo clique não deve reabrir. */
const REOPEN_GUARD_MS = 250;

/** Menu da barra do macOS. É uma janela própria porque um menu nativo não reproduz o frame 1d. */
export class MenuWindow {
  private window: BrowserWindow | null = null;
  private hiddenByBlurAt = 0;

  create(): void {
    const window = new BrowserWindow({
      width: WIDTH,
      height: 300,
      useContentSize: true,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      type: 'panel',
      hasShadow: true,
      vibrancy: 'menu',
      visualEffectState: 'active',
      webPreferences: secureWebPreferences,
    });
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    window.on('blur', () => {
      this.hiddenByBlurAt = Date.now();
      window.hide();
    });
    window.on('closed', () => {
      this.window = null;
    });
    loadPage(window, 'menu');
    this.window = window;
  }

  toggle(trayBounds: Rectangle): void {
    if (!this.window) return;
    if (this.window.isVisible()) {
      this.window.hide();
      return;
    }
    if (Date.now() - this.hiddenByBlurAt < REOPEN_GUARD_MS) return;
    this.window.setPosition(
      Math.round(trayBounds.x + trayBounds.width / 2 - WIDTH / 2),
      Math.round(trayBounds.y + trayBounds.height + GAP_BELOW_TRAY),
    );
    this.window.show();
    this.window.focus();
  }

  hide(): void {
    this.window?.hide();
  }
}
