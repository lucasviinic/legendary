import type { EnrichRequestWord, EnrichedWord, WordCard } from '@legendary/contracts';
import { wordKey, type WordCandidate } from '@legendary/core/pipeline';
import type { createPipeline } from '@legendary/core/pipeline';
import { EnrichQueue } from '../ai/queue';
import type { LLMProvider } from '../ai/types';
import type { Repositories } from '../db/repositories';
import type { WordSense } from '../db/repositories/senses';
import type { SettingsService } from './settings';

/** Depois disso a palavra já saiu de cena, então não vale mostrar o card. */
const WAITING_TTL_MS = 30_000;
const MINUTE_MS = 60_000;

interface Entry extends WordCandidate {
  senseId: number | null;
  sense: WordSense | null;
  firstSeenAt: number;
  firstSentence: string;
  queuedAt: number;
  shownAt: number | null;
  saved: boolean;
}

export interface VocabularyEmitter {
  card(card: WordCard): void;
  cardUpdate(card: WordCard): void;
  cardRemove(lemma: string): void;
  highlight(text: string, surfaces: string[]): void;
}

export interface VocabularyDeps {
  repos: Repositories;
  pipeline: ReturnType<typeof createPipeline>;
  settings: SettingsService;
  getProvider: () => LLMProvider | null;
  now: () => number;
  emit: VocabularyEmitter;
}

/** Transforma legendas em cards: decide o que mostrar, quando e pede a tradução à IA. */
export class VocabularyService {
  private readonly queue: EnrichQueue;
  private sessionId: number | null = null;
  private entries = new Map<string, Entry>();
  private counts = new Map<string, number>();
  private known = new Set<string>();
  private lastCardAt = -Infinity;
  private shownOrder: string[] = [];
  private failing = false;
  private queued = 0;

  constructor(private readonly deps: VocabularyDeps) {
    this.queue = new EnrichQueue({
      enrich: (batch) => this.enrich(batch),
      onResult: (request, result) => this.handleEnriched(request, result),
      onFailure: (pending) => {
        this.failing = true;
        this.queued = pending;
      },
      onRecovered: () => {
        this.failing = false;
        this.queued = 0;
      },
    });
  }

  get aiFailing(): boolean {
    return this.failing;
  }

  get queuedWords(): number {
    return this.failing ? this.queue.pending : 0;
  }

  get newWords(): number {
    return this.shownOrder.length;
  }

  begin(): void {
    this.sessionId = null;
    this.entries = new Map();
    this.counts = new Map();
    this.known = this.deps.repos.known.all();
    this.lastCardAt = -Infinity;
    this.shownOrder = [];
    this.failing = false;
    this.queued = 0;
    this.queue.clear();
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }

  end(): void {
    this.queue.clear();
    this.failing = false;
    this.queued = 0;
  }

  handleCaption(sessionId: number, text: string): void {
    this.sessionId = sessionId;
    const { level } = this.deps.settings.get();
    const now = this.deps.now();
    const candidates = this.deps.pipeline(text, {
      level,
      known: this.known,
      sessionCounts: this.counts,
    });

    for (const candidate of candidates) {
      const key = wordKey(candidate.lemma, candidate.pos);
      this.counts.set(key, candidate.count);
      const entry = this.entries.get(key);
      if (entry?.shownAt != null) {
        entry.count = candidate.count;
        this.persistCount(entry);
        this.deps.emit.cardUpdate(this.toCard(entry));
      } else if (entry) {
        Object.assign(entry, candidate, { queuedAt: now });
      } else {
        this.entries.set(key, {
          ...candidate,
          senseId: null,
          sense: null,
          firstSeenAt: now,
          firstSentence: candidate.sentence,
          queuedAt: now,
          shownAt: null,
          saved: false,
        });
      }
    }
    this.drain(now, text);
  }

  tick(): void {
    this.drain(this.deps.now(), null);
  }

  markKnown(lemma: string): void {
    const now = this.deps.now();
    this.deps.repos.known.add(lemma, now);
    this.known.add(lemma);
    for (const [key, entry] of this.entries) {
      if (entry.lemma === lemma) {
        this.entries.delete(key);
        this.shownOrder = this.shownOrder.filter((item) => item !== key);
      }
    }
    this.deps.emit.cardRemove(lemma);
  }

  markCurrentKnown(): void {
    const key = this.shownOrder.at(-1);
    const entry = key ? this.entries.get(key) : undefined;
    if (entry) this.markKnown(entry.lemma);
  }

  /** Inverte o estado de salva. Antes da tradução chegar, a escolha fica guardada na memória. */
  toggleSaved(lemma: string): boolean {
    const entry = [...this.entries.values()].find((item) => item.lemma === lemma);
    if (!entry) return false;
    entry.saved =
      entry.senseId === null
        ? !entry.saved
        : this.deps.repos.saved.toggle(entry.senseId, this.deps.now());
    this.deps.emit.cardUpdate(this.toCard(entry));
    return entry.saved;
  }

  /** `captionText` é a legenda que acabou de chegar, ou nulo quando quem chama é o relógio. */
  private drain(now: number, captionText: string | null) {
    const waiting: Entry[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.shownAt != null) continue;
      if (now - entry.queuedAt > WAITING_TTL_MS) this.entries.delete(key);
      else waiting.push(entry);
    }

    const { cardsPerMinute, highlightSubtitles } = this.deps.settings.get();
    if (now - this.lastCardAt < MINUTE_MS / cardsPerMinute) return;

    const next = waiting.sort((a, b) => b.score - a.score)[0];
    if (!next) return;

    this.show(next, now);
    if (captionText && highlightSubtitles && next.queuedAt === now) {
      this.deps.emit.highlight(captionText, [next.surface]);
    }
  }

  private show(entry: Entry, now: number) {
    entry.shownAt = now;
    this.lastCardAt = now;
    this.shownOrder.push(wordKey(entry.lemma, entry.pos));

    const sense = this.deps.repos.senses.findByLemmaPos(entry.lemma, entry.pos);
    if (sense) {
      this.attachSense(entry, sense);
    } else {
      this.queue.add({
        lemma: entry.lemma,
        pos: entry.pos,
        surface: entry.surface,
        sentence: entry.sentence,
      });
    }
    this.deps.emit.card(this.toCard(entry));
  }

  private attachSense(entry: Entry, sense: WordSense) {
    entry.sense = sense;
    entry.senseId = sense.id;
    if (entry.saved && !this.deps.repos.saved.isSaved(sense.id)) {
      this.deps.repos.saved.toggle(sense.id, this.deps.now());
    } else {
      entry.saved = this.deps.repos.saved.isSaved(sense.id);
    }
    this.persistCount(entry);
  }

  private persistCount(entry: Entry) {
    if (entry.senseId === null || this.sessionId === null) return;
    this.deps.repos.sessionWords.upsert({
      sessionId: this.sessionId,
      senseId: entry.senseId,
      count: entry.count,
      contextSentence: entry.firstSentence,
      firstSeenAt: entry.firstSeenAt,
    });
  }

  private enrich(batch: EnrichRequestWord[]): Promise<EnrichedWord[]> {
    const provider = this.deps.getProvider();
    if (!provider) return Promise.reject(new Error('Sem API key configurada.'));
    return provider.enrichWords(batch);
  }

  private handleEnriched(request: EnrichRequestWord, result: EnrichedWord) {
    const sense = this.deps.repos.senses.insert({
      lemma: request.lemma,
      pos: request.pos,
      translation: result.translation,
      explanation: result.explanation,
      exampleEn: result.exampleEn,
      examplePt: result.examplePt,
      cefr: result.cefr,
      provider: this.deps.getProvider()?.name ?? 'unknown',
    });
    const entry = this.entries.get(wordKey(request.lemma, request.pos));
    if (!entry) return;
    this.attachSense(entry, sense);
    this.deps.emit.cardUpdate(this.toCard(entry));
  }

  private toCard(entry: Entry): WordCard {
    const { sense } = entry;
    return {
      lemma: entry.lemma,
      surface: entry.surface,
      pos: entry.pos,
      cefr: (sense?.cefr as WordCard['cefr']) ?? entry.estimatedCefr,
      translation: sense?.translation ?? null,
      explanation: sense?.explanation ?? null,
      sentence: entry.sentence,
      extraExample: sense?.exampleEn ?? null,
      count: entry.count,
      saved: entry.saved,
    };
  }
}
