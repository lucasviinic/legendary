import { BrowserWindow, type Display } from 'electron';
import { loadPage, secureWebPreferences } from './common';

const WIDTH = 480;
const HEIGHT = 92;
const FROM_TOP = 0.2;
const SAME_PRESS_MS = 200;

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

  toggle({ bounds }: Pick<Display, 'bounds'>): boolean {
    if (!this.window) return false;
    const now = Date.now();
    if (now - this.toggledAt < SAME_PRESS_MS) return false;
    this.toggledAt = now;
    if (this.window.isVisible()) {
      this.window.hide();
      return false;
    }
    this.window.setPosition(
      Math.round(bounds.x + (bounds.width - WIDTH) / 2),
      Math.round(bounds.y + bounds.height * FROM_TOP),
    );
    this.window.show();
    this.window.focus();
    return true;
  }

  hide(): void {
    this.window?.hide();
  }
}
