import type { EnrichRequestWord, EnrichedWord } from '@legendary/contracts';

const MAX_BATCH = 5;
const MAX_WAIT_MS = 8_000;
const MAX_CALLS_PER_MINUTE = 10;
const MINUTE_MS = 60_000;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

interface Waiting {
  word: EnrichRequestWord;
  queuedAt: number;
}

export interface EnrichQueueOptions {
  enrich: (batch: EnrichRequestWord[]) => Promise<EnrichedWord[]>;
  onResult: (request: EnrichRequestWord, result: EnrichedWord) => void;
  onFailure: (pending: number) => void;
  onRecovered: () => void;
}

const sameWord = (a: EnrichRequestWord, b: EnrichRequestWord) =>
  a.lemma === b.lemma && a.pos === b.pos;

/** Junta palavras em lotes de até 5 ou a cada 8 s, com limite de chamadas e nova tentativa. */
export class EnrichQueue {
  private waiting: Waiting[] = [];
  private inFlight: EnrichRequestWord[] = [];
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private callTimes: number[] = [];
  private failures = 0;
  private retryAt = 0;
  private held = false;

  constructor(private readonly options: EnrichQueueOptions) {}

  get pending(): number {
    return this.waiting.length + this.inFlight.length;
  }

  add(word: EnrichRequestWord): void {
    const known =
      this.waiting.some((item) => sameWord(item.word, word)) ||
      this.inFlight.some((item) => sameWord(item, word));
    if (known) return;
    this.waiting.push({ word, queuedAt: Date.now() });
    this.schedule();
  }

  /** Envia o que está esperando, sem nova tentativa. Usado ao encerrar a sessão. */
  async flush(): Promise<void> {
    this.held = true;
    this.clearTimer();
    try {
      if (this.running) await this.running;
      while (this.waiting.length > 0) {
        const before = this.failures;
        await this.sendNext();
        if (this.failures > before) break;
      }
    } finally {
      this.held = false;
    }
  }

  clear(): void {
    this.clearTimer();
    this.waiting = [];
    this.failures = 0;
    this.retryAt = 0;
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    this.clearTimer();
    const oldest = this.waiting[0];
    if (this.held || this.running || !oldest) return;

    const now = Date.now();
    this.callTimes = this.callTimes.filter((time) => now - time < MINUTE_MS);
    const ready = this.waiting.length >= MAX_BATCH ? now : oldest.queuedAt + MAX_WAIT_MS;
    const rateLimited =
      this.callTimes.length >= MAX_CALLS_PER_MINUTE ? this.callTimes[0]! + MINUTE_MS : now;
    const at = Math.max(ready, rateLimited, this.retryAt);

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sendNext();
    }, at - now);
  }

  private sendNext(): Promise<void> {
    const batch = this.waiting.splice(0, MAX_BATCH);
    this.inFlight = batch.map((item) => item.word);
    this.callTimes.push(Date.now());

    this.running = this.options
      .enrich(this.inFlight)
      .then((results) => this.handleSuccess(results))
      .catch(() => this.handleFailure(batch))
      .finally(() => {
        this.running = null;
        this.schedule();
      });
    return this.running;
  }

  private handleSuccess(results: EnrichedWord[]) {
    const requests = this.inFlight;
    this.inFlight = [];
    const recovered = this.failures > 0;
    this.failures = 0;
    this.retryAt = 0;

    for (const request of requests) {
      const result =
        results.find((item) => item.lemma === request.lemma && item.pos === request.pos) ??
        results.find((item) => item.lemma === request.lemma);
      if (result) this.options.onResult(request, result);
    }
    if (recovered) this.options.onRecovered();
  }

  private handleFailure(batch: Waiting[]) {
    this.inFlight = [];
    this.waiting.unshift(...batch);
    this.failures += 1;
    this.retryAt =
      Date.now() + Math.min(BASE_BACKOFF_MS * 2 ** (this.failures - 1), MAX_BACKOFF_MS);
    this.options.onFailure(this.pending);
  }
}
