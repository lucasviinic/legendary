import { join } from 'node:path';
import { nativeImage, nativeTheme, Tray } from 'electron';

/** Ícone da barra de menus. O ponto vermelho do frame 1d aparece só com a sessão ativa. */
export class AppTray {
  private readonly tray: Tray;
  private active = false;

  constructor(
    private readonly iconsDir: string,
    onClick: (bounds: Electron.Rectangle) => void,
  ) {
    this.tray = new Tray(this.icon());
    this.tray.setToolTip('Legendary');
    this.tray.on('click', () => onClick(this.tray.getBounds()));
    nativeTheme.on('updated', () => this.refresh());
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.refresh();
  }

  private refresh() {
    this.tray.setImage(this.icon());
  }

  private icon() {
    if (!this.active) return nativeImage.createFromPath(join(this.iconsDir, 'trayTemplate.png'));
    const tone = nativeTheme.shouldUseDarkColors ? 'Light' : 'Dark';
    return nativeImage.createFromPath(join(this.iconsDir, `trayActive${tone}.png`));
  }
}
