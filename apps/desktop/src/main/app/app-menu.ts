import { Menu } from 'electron';

/**
 * Menu da aplicação. Fica sem barra visível num app de barra de menus, mas sem ele o ⌘V não
 * funciona no campo da API key, e ⌘, e ⌘Q mostrados no frame 1d não respondem.
 */
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
