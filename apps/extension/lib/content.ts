import { browser } from 'wxt/browser';
import { readCaption, watchCaptions, type SiteConfig } from './caption-watcher';
import { applyHighlight } from './highlight';
import type { RuntimeMessage, TabMessage } from './messages';
import { isSearchShortcut } from './shortcut';
import { observeResources, watchTrack } from './track';

export function startTrackCapture(source: SiteConfig['source']): void {
  watchTrack({
    source,
    origin: location.origin,
    observe: observeResources,
    fetchJson: (url) =>
      fetch(url, { credentials: 'include' }).then((response) => {
        if (!response.ok) throw new Error(`timedtext ${response.status}`);
        return response.json() as Promise<unknown>;
      }),
    send: (track) => {
      const message: RuntimeMessage = { type: 'track', track };
      browser.runtime.sendMessage(message).catch(() => undefined);
    },
  });
}

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
