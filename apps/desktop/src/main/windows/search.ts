import { BrowserWindow, type Display } from 'electron';
import { loadPage, secureWebPreferences } from './common';

const WIDTH = 480;
/** A barra tem 44 de altura. O resto da janela transparente é espaço para a sombra. */
const HEIGHT = 92;
const FROM_TOP = 0.2;
/** O sistema e a extensão podem avisar do mesmo toque, e isso não pode abrir e fechar a barra. */
const SAME_PRESS_MS = 200;

/**
 * Barra de busca de palavras. É um painel, como o menu: recebe o teclado sem ativar o app, então o
 * navegador continua na frente e o vídeo não sai da tela cheia.
 */
export class SearchWindow {
  private window: BrowserWindow | null = null;
  private toggledAt = -Infinity;

  create(): void {
    const window = new BrowserWindow({
      width: WIDTH,
      height: HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      type: 'panel',
      backgroundColor: '#00000000',
      webPreferences: secureWebPreferences,
    });
    // Um nível acima do overlay, que cobre a tela inteira.
    window.setAlwaysOnTop(true, 'screen-saver', 1);
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    });
    window.setContentProtection(true);
    window.on('blur', () => window.hide());
    window.on('closed', () => {
      this.window = null;
    });
    loadPage(window, 'search');
    this.window = window;
  }

  toggle({ bounds }: Pick<Display, 'bounds'>): void {
    if (!this.window) return;
    const now = Date.now();
    if (now - this.toggledAt < SAME_PRESS_MS) return;
    this.toggledAt = now;
    if (this.window.isVisible()) {
      this.window.hide();
      return;
    }
    this.window.setPosition(
      Math.round(bounds.x + (bounds.width - WIDTH) / 2),
      Math.round(bounds.y + bounds.height * FROM_TOP),
    );
    this.window.show();
    this.window.focus();
  }

  hide(): void {
    this.window?.hide();
  }
}
