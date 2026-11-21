import { BrowserWindow, screen, type Display, type Rectangle } from 'electron';
import { loadPage, secureWebPreferences } from './common';

export class OverlayWindow {
  private window: BrowserWindow | null = null;
  private userHidden = false;
  private sessionActive = false;
  private displayId: number | null = null;
  private onDisplayChange: () => void = () => undefined;

  get current(): BrowserWindow | null {
    return this.window;
  }

  get display(): Display {
    return (
      screen.getAllDisplays().find((display) => display.id === this.displayId) ??
      screen.getPrimaryDisplay()
    );
  }

  follow(bounds: Rectangle): void {
    const target = screen.getDisplayMatching(bounds);
    if (target.id === this.display.id) return;
    this.displayId = target.id;
    this.window?.setBounds(target.bounds);
    this.onDisplayChange();
  }

  create(onDisplayChange: () => void): void {
    this.onDisplayChange = onDisplayChange;
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
      this.onDisplayChange();
    };
    screen.on('display-metrics-changed', followDisplay);
    screen.on('display-added', followDisplay);
    screen.on('display-removed', followDisplay);
  }

  setInteractive(interactive: boolean): void {
    this.window?.setIgnoreMouseEvents(!interactive, { forward: true });
  }

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
