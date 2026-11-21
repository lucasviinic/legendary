import { MAX_TRACK_CUES, type CaptionTrack, type Source } from '@legendary/contracts';

const TIMEDTEXT_PATH = '/api/timedtext';

interface Json3 {
  events?: { segs?: { utf8?: string }[] }[];
}

export function parseJson3(data: unknown): string[] {
  const events = (data as Json3 | null)?.events ?? [];
  return events.flatMap((event) => {
    const text = (event.segs ?? [])
      .map((segment) => segment.utf8 ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? [text] : [];
  });
}

export interface TimedText {
  url: string;
  key: string;
}

export function readTimedTextUrl(raw: string, origin: string): TimedText | null {
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.pathname !== TIMEDTEXT_PATH) return null;
  const language = url.searchParams.get('tlang') ?? url.searchParams.get('lang') ?? '';
  if (!language.toLowerCase().startsWith('en')) return null;
  url.searchParams.set('fmt', 'json3');
  const key = ['v', 'lang', 'tlang', 'kind'].map((name) => url.searchParams.get(name)).join('|');
  return { url: url.toString(), key };
}

export interface TrackWatchOptions {
  source: Source;
  origin: string;
  observe: (onUrl: (url: string) => void) => () => void;
  fetchJson: (url: string) => Promise<unknown>;
  send: (track: CaptionTrack) => void;
}

export function watchTrack({ source, origin, observe, fetchJson, send }: TrackWatchOptions) {
  let latest = '';
  return observe((raw) => {
    const found = readTimedTextUrl(raw, origin);
    if (!found || found.key === latest) return;
    latest = found.key;
    fetchJson(found.url)
      .then((data) => {
        const cues = parseJson3(data).slice(0, MAX_TRACK_CUES);
        if (cues.length > 0 && found.key === latest) send({ source, cues });
      })
      .catch(() => {
        if (found.key === latest) latest = '';
      });
  });
}

export function observeResources(onUrl: (url: string) => void): () => void {
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => onUrl(entry.name));
  });
  observer.observe({ type: 'resource', buffered: true });
  return () => observer.disconnect();
}
