import { browser } from 'wxt/browser';
import { readCaption, watchCaptions, type SiteConfig } from './caption-watcher';
import { applyHighlight } from './highlight';
import type { RuntimeMessage, TabMessage } from './messages';

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

  browser.runtime.onMessage.addListener((message: unknown) => {
    const highlight = message as TabMessage;
    if (highlight.type !== 'highlight' || highlight.text !== lastSent) return;
    if (readCaption(site, document) === lastSent) {
      applyHighlight(document, site.caption, highlight.surfaces);
    }
  });
}
