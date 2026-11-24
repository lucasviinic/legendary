import type {
  CaptionEvent,
  CaptureOrigin,
  CaptionTrack,
  SessionNotice,
  SessionStatus,
  Source,
} from '@legendary/contracts';
import { suggestWords } from '@legendary/core';
import type { Repositories } from '../db/repositories';
import type { VocabularyService } from './vocabulary';

const NO_CAPTIONS_AT_START_MS = 20_000;
const NO_CAPTIONS_AFTER_START_MS = 120_000;
const FLUSH_LIMIT_MS = 5_000;
const SUGGEST_WINDOW_MS = 30_000;
const KEPT_CAPTIONS = 200;
const UNTITLED = 'Sessão sem título';

export interface SessionDeps {
  repos: Repositories;
  vocabulary: VocabularyService;
  now: () => number;
  emitStatus: (status: SessionStatus) => void;
}

export class SessionService {
  private state: SessionStatus['state'] = 'idle';
  private origin: CaptureOrigin = 'browser';
  private source: Source | null = null;
  private sessionId: number | null = null;
  private title: string | null = null;
  private startedAt = 0;
  private watchedMs = 0;
  private resumedAt = 0;
  private waitingSince = 0;
  private hadCaption = false;
  private track: CaptionTrack | null = null;
  private sourceNotice: SessionNotice | null = null;
  private earlierWords = 0;
  private lastSongWithWords: number | null = null;
  private rowStartedAt = 0;
  private switching: Promise<void> | null = null;
  private waiting: (() => void)[] = [];
  private captions: { text: string; at: number }[] = [];
  private searchOpenedAt = 0;

  constructor(private readonly deps: SessionDeps) {}

  status(): SessionStatus {
    return {
      state: this.state,
      elapsedMs: this.elapsed(),
      newWords: this.earlierWords + this.deps.vocabulary.newWords,
      source: this.source,
      origin: this.origin,
      notice: this.notice(),
      queuedWords: this.deps.vocabulary.queuedWords,
    };
  }

  start(origin: CaptureOrigin): void {
    if (origin === 'audio') throw new Error('A captura de áudio ainda não está disponível.');
    if (this.state !== 'idle') return;

    const now = this.deps.now();
    this.state = 'active';
    this.origin = origin;
    this.source = null;
    this.sessionId = null;
    this.title = null;
    this.startedAt = now;
    this.watchedMs = 0;
    this.resumedAt = now;
    this.waitingSince = now;
    this.hadCaption = false;
    this.captions = [];
    this.rowStartedAt = now;
    this.sourceNotice = null;
    this.earlierWords = 0;
    this.lastSongWithWords = null;
    this.switching = null;
    this.waiting = [];
    this.deps.vocabulary.begin();
    if (this.track && origin === 'browser') this.deps.vocabulary.useTrack(this.track.cues);
    this.publish();
  }

  togglePause(): void {
    const now = this.deps.now();
    if (this.state === 'active') {
      this.watchedMs += now - this.resumedAt;
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.resumedAt = now;
      this.waitingSince = now;
      this.state = 'active';
    }
    this.publish();
  }

  tick(): void {
    if (this.state === 'idle') return;
    if (this.state === 'active') this.deps.vocabulary.tick();
    this.publish();
  }

  handleCaption(caption: CaptionEvent): void {
    if (this.state !== 'active') return;
    if (this.switching) {
      this.waiting.push(() => this.handleCaption(caption));
      return;
    }
    this.waitingSince = this.deps.now();
    this.hadCaption = true;
    this.captions = [...this.captions, { text: caption.text, at: this.waitingSince }].slice(
      -KEPT_CAPTIONS,
    );
    this.source = caption.source;
    const sessionId = this.ensureSession(caption);
    this.deps.vocabulary.handleCaption(sessionId, caption.text);
    this.publish();
  }

  handleTrack(track: CaptionTrack): void {
    if (this.switching) {
      this.waiting.push(() => this.handleTrack(track));
      return;
    }
    if (track.source !== 'spotify') this.track = track;
    if (this.state !== 'idle') this.deps.vocabulary.useTrack(track.cues);
  }

  handleSong(): Promise<void> {
    if (this.state === 'idle' || this.origin !== 'spotify') return Promise.resolve();
    const startedAt = this.deps.now();
    const switching = (this.switching ?? Promise.resolve()).then(() => this.closeSong(startedAt));
    this.switching = switching;
    return switching.then(() => {
      if (this.switching !== switching) return;
      this.switching = null;
      const waiting = this.waiting;
      this.waiting = [];
      waiting.forEach((run) => run());
    });
  }

  setSourceNotice(notice: SessionNotice | null): void {
    this.sourceNotice = notice;
    if (this.state !== 'idle') this.publish();
  }

  search(query: string): boolean {
    if (this.state === 'idle') return false;
    const found = this.deps.vocabulary.search(query);
    this.publish();
    return found;
  }

  openSearch(): void {
    this.searchOpenedAt = this.deps.now();
  }

  suggest(query: string): string[] {
    if (this.state === 'idle') return [];
    const since = this.searchOpenedAt - SUGGEST_WINDOW_MS;
    const shown = this.captions.filter((_, i, all) => (all[i + 1]?.at ?? Infinity) > since);
    return suggestWords(
      query,
      shown.map(({ text }) => text),
    );
  }

  async stop(): Promise<number | null> {
    if (this.state === 'idle') return null;
    await this.switching;
    const elapsed = this.elapsed();
    const newWords = this.deps.vocabulary.newWords;
    const sessionId = this.sessionId;

    await this.flushWithLimit();
    this.deps.vocabulary.end();
    if (sessionId !== null) {
      const endedAt = this.origin === 'spotify' ? this.deps.now() : this.startedAt + elapsed;
      this.deps.repos.sessions.end(sessionId, endedAt);
    }

    this.state = 'idle';
    this.watchedMs = 0;
    this.source = null;
    this.deps.vocabulary.begin();
    this.publish();
    const current = newWords > 0 ? sessionId : null;
    return current ?? (this.origin === 'spotify' ? this.lastSongWithWords : null);
  }

  private async closeSong(startedAt: number) {
    const sessionId = this.sessionId;
    if (sessionId !== null) await this.flushWithLimit();
    const words = this.deps.vocabulary.newWords;
    if (sessionId !== null) {
      if (words > 0) this.lastSongWithWords = sessionId;
      this.deps.repos.sessions.end(sessionId, this.deps.now());
    }
    this.earlierWords += words;
    this.sessionId = null;
    this.title = null;
    this.rowStartedAt = startedAt;
    this.deps.vocabulary.begin({ keepShown: true });
    this.publish();
  }

  private async flushWithLimit() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, FLUSH_LIMIT_MS);
    });
    await Promise.race([this.deps.vocabulary.flush(), limit]);
    clearTimeout(timer);
  }

  private ensureSession(caption: CaptionEvent): number {
    const title = caption.mediaTitle?.trim() || null;
    if (this.sessionId === null) {
      const row = this.deps.repos.sessions.create({
        title: title ?? UNTITLED,
        source: caption.source,
        startedAt: this.rowStartedAt,
      });
      this.sessionId = row.id;
      this.title = title;
    } else if (title && title !== this.title) {
      this.deps.repos.sessions.setTitle(this.sessionId, title);
      this.title = title;
    }
    return this.sessionId;
  }

  private elapsed(): number {
    if (this.state === 'active') return this.watchedMs + (this.deps.now() - this.resumedAt);
    return this.watchedMs;
  }

  private notice(): SessionStatus['notice'] {
    if (this.state !== 'active') return null;
    if (this.deps.vocabulary.aiFailing) return 'ai_error';
    if (this.origin === 'spotify') return this.sourceNotice;
    const silence = this.deps.now() - this.waitingSince;
    const limit = this.hadCaption ? NO_CAPTIONS_AFTER_START_MS : NO_CAPTIONS_AT_START_MS;
    return silence >= limit ? 'no_captions' : null;
  }

  private publish() {
    this.deps.emitStatus(this.status());
  }
}
