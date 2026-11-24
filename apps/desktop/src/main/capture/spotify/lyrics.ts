import { parseLrc, type LrcLine } from '@legendary/core';

export interface LyricsQuery {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationS: number;
}

export interface LyricsClient {
  find(query: LyricsQuery): Promise<LrcLine[] | null>;
}

export type Fetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface LrclibRecord {
  duration?: unknown;
  syncedLyrics?: unknown;
}

const BASE = 'https://lrclib.net/api';
const TIMEOUT_MS = 10_000;
const SEARCH_TOLERANCE_S = 5;

const synced = (record: LrclibRecord | null | undefined): string | null =>
  typeof record?.syncedLyrics === 'string' && record.syncedLyrics.trim()
    ? record.syncedLyrics
    : null;

const linesOf = (lrc: string | null): LrcLine[] | null => {
  const lines = lrc ? parseLrc(lrc) : [];
  return lines.length > 0 ? lines : null;
};

export class LrclibClient implements LyricsClient {
  private readonly cache = new Map<string, LrcLine[] | null>();

  constructor(private readonly options: { userAgent: string; fetch?: Fetch }) {}

  async find(query: LyricsQuery): Promise<LrcLine[] | null> {
    if (this.cache.has(query.id)) return this.cache.get(query.id) ?? null;
    let lines: LrcLine[] | null;
    try {
      lines = await this.lookup(query);
    } catch {
      return null;
    }
    this.cache.set(query.id, lines);
    return lines;
  }

  private async lookup(query: LyricsQuery): Promise<LrcLine[] | null> {
    const exact = await this.get<LrclibRecord>('get', {
      track_name: query.name,
      artist_name: query.artist,
      album_name: query.album,
      duration: String(Math.round(query.durationS)),
    });
    const exactLyrics = synced(exact);
    if (exactLyrics) return linesOf(exactLyrics);

    const results = await this.get<LrclibRecord[]>('search', {
      track_name: query.name,
      artist_name: query.artist,
    });
    const distance = (record: LrclibRecord) =>
      typeof record.duration === 'number' ? Math.abs(record.duration - query.durationS) : Infinity;
    const best = (Array.isArray(results) ? results : [])
      .filter((record) => synced(record) && distance(record) <= SEARCH_TOLERANCE_S)
      .sort((a, b) => distance(a) - distance(b))[0];
    return linesOf(synced(best));
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const fetcher = this.options.fetch ?? (globalThis.fetch as unknown as Fetch);
    const response = await fetcher(`${BASE}/${path}?${new URLSearchParams(params)}`, {
      headers: { 'User-Agent': this.options.userAgent },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`O LRCLIB respondeu ${response.status}.`);
    return (await response.json()) as T;
  }
}
