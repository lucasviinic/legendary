import type { CaptionEvent, CaptureOrigin, SessionStatus, Source } from '@legendary/contracts';
import type { Repositories } from '../db/repositories';
import type { VocabularyService } from './vocabulary';

const NO_CAPTIONS_AT_START_MS = 20_000;
/** Cenas longas sem fala são normais, então a tolerância é maior depois da primeira legenda. */
const NO_CAPTIONS_AFTER_START_MS = 120_000;
const FLUSH_LIMIT_MS = 5_000;
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

  constructor(private readonly deps: SessionDeps) {}

  status(): SessionStatus {
    return {
      state: this.state,
      elapsedMs: this.elapsed(),
      newWords: this.deps.vocabulary.newWords,
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
    this.deps.vocabulary.begin();
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
    this.waitingSince = this.deps.now();
    this.hadCaption = true;
    this.source = caption.source;
    const sessionId = this.ensureSession(caption);
    this.deps.vocabulary.handleCaption(sessionId, caption.text);
    this.publish();
  }

  /** Devolve falso quando não há sessão ou o texto não tem palavra, e nesse caso nada mudou. */
  search(query: string): boolean {
    if (this.state === 'idle') return false;
    const found = this.deps.vocabulary.search(query);
    this.publish();
    return found;
  }

  /** Encerra a sessão e devolve o id dela, ou nulo quando não há palavras para o quiz. */
  async stop(): Promise<number | null> {
    if (this.state === 'idle') return null;
    const elapsed = this.elapsed();
    const newWords = this.deps.vocabulary.newWords;
    const sessionId = this.sessionId;

    await this.flushWithLimit();
    this.deps.vocabulary.end();
    if (sessionId !== null) this.deps.repos.sessions.end(sessionId, this.startedAt + elapsed);

    this.state = 'idle';
    this.watchedMs = 0;
    this.source = null;
    this.deps.vocabulary.begin();
    this.publish();
    return newWords > 0 ? sessionId : null;
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
        startedAt: this.startedAt,
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
    const silence = this.deps.now() - this.waitingSince;
    const limit = this.hadCaption ? NO_CAPTIONS_AFTER_START_MS : NO_CAPTIONS_AT_START_MS;
    return silence >= limit ? 'no_captions' : null;
  }

  private publish() {
    this.deps.emitStatus(this.status());
  }
}
