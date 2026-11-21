import { Menu } from 'electron';

export function setApplicationMenu(openSettings: () => void): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Legendary',
        submenu: [
          { label: 'Configurações…', accelerator: 'Command+,', click: openSettings },
          { type: 'separator' },
          { role: 'quit', label: 'Sair do Legendary' },
        ],
      },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]),
  );
}
