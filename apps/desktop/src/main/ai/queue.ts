import type { EnrichRequestWord, EnrichedWord } from '@legendary/contracts';

const MAX_BATCH = 5;
const MAX_CALLS_PER_MINUTE = 10;
/** Antecipar nunca gasta todas as chamadas do minuto: as outras ficam para os cards na tela. */
const MAX_AHEAD_CALLS_PER_MINUTE = 6;
/** Assim um card na tela não espera a chamada que já está em andamento. */
const MAX_RUNNING_CALLS = 2;
/** Junta as palavras antecipadas de legendas seguidas numa chamada só. */
const AHEAD_GATHER_MS = 1_500;
const MINUTE_MS = 60_000;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

interface Waiting {
  word: EnrichRequestWord;
  queuedAt: number;
  /** Verdadeiro quando o card já está na tela. As demais só estão sendo antecipadas. */
  urgent: boolean;
}

export interface EnrichQueueOptions {
  enrich: (batch: EnrichRequestWord[]) => Promise<EnrichedWord[]>;
  onResult: (request: EnrichRequestWord, result: EnrichedWord) => void;
  onFailure: (pending: number) => void;
  onRecovered: () => void;
}

const sameWord = (a: EnrichRequestWord, b: EnrichRequestWord) =>
  a.lemma === b.lemma && a.pos === b.pos;

/**
 * Fila de tradução. A palavra de um card na tela vai na hora. As outras esperam um instante para
 * dividir a chamada e, se ela falhar, não são repetidas. Limita as chamadas e tenta de novo com
 * espera crescente.
 */
export class EnrichQueue {
  private waiting: Waiting[] = [];
  private inFlight: Waiting[] = [];
  private readonly running = new Set<Promise<void>>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private callTimes: number[] = [];
  private failures = 0;
  private retryAt = 0;
  private held = false;

  constructor(private readonly options: EnrichQueueOptions) {}

  /** Palavras de cards na tela ainda sem tradução. */
  get pending(): number {
    return [...this.waiting, ...this.inFlight].filter((item) => item.urgent).length;
  }

  /** Pede a tradução de uma palavra que já está na tela. */
  add(word: EnrichRequestWord): void {
    const known = this.find(word);
    if (known) known.urgent = true;
    else this.waiting.push({ word, queuedAt: Date.now(), urgent: true });
    this.schedule();
  }

  /** Adianta a tradução de uma palavra que ainda espera a vez de virar card. */
  addAhead(word: EnrichRequestWord): void {
    if (this.find(word)) return;
    this.waiting.push({ word, queuedAt: Date.now(), urgent: false });
    this.schedule();
  }

  /** Envia o que está na tela e ainda espera, sem nova tentativa. Usado ao encerrar a sessão. */
  async flush(): Promise<void> {
    this.held = true;
    this.clearTimer();
    this.waiting = this.waiting.filter((item) => item.urgent);
    try {
      await Promise.all(this.running);
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

  private find(word: EnrichRequestWord): Waiting | undefined {
    return [...this.waiting, ...this.inFlight].find((item) => sameWord(item.word, word));
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    this.clearTimer();
    const oldest = this.waiting[0];
    if (this.held || !oldest) return;

    const urgent = this.waiting.some((item) => item.urgent);
    if (this.running.size >= (urgent ? MAX_RUNNING_CALLS : 1)) return;

    const now = Date.now();
    this.callTimes = this.callTimes.filter((time) => now - time < MINUTE_MS);
    const limit = urgent ? MAX_CALLS_PER_MINUTE : MAX_AHEAD_CALLS_PER_MINUTE;
    const rateLimited =
      this.callTimes.length >= limit ? this.callTimes.at(-limit)! + MINUTE_MS : now;
    const ready =
      urgent || this.waiting.length >= MAX_BATCH ? now : oldest.queuedAt + AHEAD_GATHER_MS;
    const at = Math.max(ready, rateLimited, this.retryAt);

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.sendNext();
      this.schedule();
    }, at - now);
  }

  private sendNext(): Promise<void> {
    // A ordem importa: a resposta vem na ordem do pedido, e o card na tela não pode esperar.
    const byUrgency = [...this.waiting].sort((a, b) => Number(b.urgent) - Number(a.urgent));
    const batch = byUrgency.slice(0, MAX_BATCH);
    this.waiting = byUrgency.slice(MAX_BATCH);
    this.inFlight.push(...batch);
    this.callTimes.push(Date.now());

    const call = this.options
      .enrich(batch.map((item) => item.word))
      .then((results) => this.handleSuccess(batch, results))
      .catch(() => this.handleFailure(batch))
      .finally(() => {
        this.running.delete(call);
        this.schedule();
      });
    this.running.add(call);
    return call;
  }

  private settle(batch: Waiting[]) {
    this.inFlight = this.inFlight.filter((item) => !batch.includes(item));
  }

  private handleSuccess(batch: Waiting[], results: EnrichedWord[]) {
    this.settle(batch);
    const recovered = this.failures > 0;
    this.failures = 0;
    this.retryAt = 0;

    for (const { word } of batch) {
      const result =
        results.find((item) => item.lemma === word.lemma && item.pos === word.pos) ??
        results.find((item) => item.lemma === word.lemma);
      if (result) this.options.onResult(word, result);
    }
    if (recovered) this.options.onRecovered();
  }

  private handleFailure(batch: Waiting[]) {
    this.settle(batch);
    const retry = batch.filter((item) => item.urgent);
    this.waiting.unshift(...retry);
    this.failures += 1;
    this.retryAt =
      Date.now() + Math.min(BASE_BACKOFF_MS * 2 ** (this.failures - 1), MAX_BACKOFF_MS);
    if (retry.length > 0) this.options.onFailure(this.pending);
  }
}
