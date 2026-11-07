import { browser } from 'wxt/browser';
import { readCaption, watchCaptions, type SiteConfig } from './caption-watcher';
import { applyHighlight } from './highlight';
import type { RuntimeMessage, TabMessage } from './messages';
import { isSearchShortcut } from './shortcut';

/** Liga a captura de legendas em uma página. A extensão pode ter sido atualizada: daí o catch. */
export function startCapture(site: SiteConfig): void {
  let lastSent = '';

  watchCaptions({
    site,
    root: document,
    send: (caption) => {
      lastSent = caption.text;
      const message: RuntimeMessage = { type: 'caption', caption };
      browser.runtime.sendMessage(message).catch(() => undefined);
    },
  });

  // Segundo caminho para o atalho, caso o atalho global do sistema não chegue ao app. Na fase de
  // captura, antes do player, e sem deixar o navegador mostrar a barra de favoritos.
  window.addEventListener(
    'keydown',
    (event) => {
      if (!isSearchShortcut(event)) return;
      event.preventDefault();
      const message: RuntimeMessage = { type: 'open-search' };
      browser.runtime.sendMessage(message).catch(() => undefined);
    },
    true,
  );

  browser.runtime.onMessage.addListener((message: unknown) => {
    const highlight = message as TabMessage;
    if (highlight.type !== 'highlight' || highlight.text !== lastSent) return;
    if (readCaption(site, document) === lastSent) {
      applyHighlight(document, site.caption, highlight.surfaces);
    }
  });
}
