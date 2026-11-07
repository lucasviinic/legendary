import type { CaptionEvent, Source } from '@legendary/contracts';

export interface SiteConfig {
  source: Source;
  caption: string;
  title: readonly string[];
}

/** Espera a legenda parar de mudar: a legenda automática do YouTube cresce palavra por palavra. */
const SETTLE_MS = 250;
/** Limita as leituras, porque essas páginas mudam o tempo todo. */
const CHECK_MS = 50;
const SITE_SUFFIX = /\s*[-|–]\s*(YouTube|Netflix)\s*$/i;

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Texto do elemento, com a quebra de linha da legenda virando espaço. */
function textOf(node: Node): string {
  let text = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) text += child.nodeValue ?? '';
    else if (child.nodeName === 'BR') text += ' ';
    else text += textOf(child);
  });
  return text;
}

function leafTexts(node: Node): string[] {
  const texts: string[] = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) texts.push(child.nodeValue ?? '');
    else texts.push(...leafTexts(child));
  });
  return texts;
}

export function readCaption(site: SiteConfig, root: ParentNode): string {
  return clean(
    [...root.querySelectorAll(site.caption)].map((element) => textOf(element)).join(' '),
  );
}

export function readTitle(site: SiteConfig, root: Document): string | undefined {
  for (const selector of site.title) {
    const element = root.querySelector(selector);
    const text = element ? clean(leafTexts(element).join(' ')) : '';
    if (text) return text;
  }
  return clean(root.title.replace(SITE_SUFFIX, '')) || undefined;
}

export interface WatchOptions {
  site: SiteConfig;
  root: Document;
  send: (caption: CaptionEvent) => void;
}

/** Observa a página e manda cada frase nova, sem repetir a que continua na tela. */
export function watchCaptions({ site, root, send }: WatchOptions): () => void {
  let lastSent = '';
  let pending = '';
  let checkTimer: ReturnType<typeof setTimeout> | undefined;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const settle = () => {
    if (!pending) {
      lastSent = '';
      return;
    }
    if (pending === lastSent) return;
    lastSent = pending;
    send({
      text: pending,
      startedAt: Date.now(),
      source: site.source,
      mediaTitle: readTitle(site, root),
    });
  };

  const check = () => {
    checkTimer = undefined;
    const text = readCaption(site, root);
    if (text === pending) return;
    pending = text;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, SETTLE_MS);
  };

  const observer = new MutationObserver(() => {
    checkTimer ??= setTimeout(check, CHECK_MS);
  });
  observer.observe(root.documentElement, { subtree: true, childList: true, characterData: true });

  return () => {
    observer.disconnect();
    clearTimeout(checkTimer);
    clearTimeout(settleTimer);
  };
}
