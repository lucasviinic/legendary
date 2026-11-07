import type { EnrichRequestWord, EnrichedWord, WordCard } from '@legendary/contracts';
import { wordKey, type WordCandidate } from '@legendary/core/pipeline';
import type { createPipeline, createWordLookup } from '@legendary/core/pipeline';
import { EnrichQueue } from '../ai/queue';
import type { LLMProvider } from '../ai/types';
import type { Repositories } from '../db/repositories';
import type { WordSense } from '../db/repositories/senses';
import type { SettingsService } from './settings';

/** Depois disso a palavra já saiu de cena, então não vale mostrar o card. */
const WAITING_TTL_MS = 30_000;
const MINUTE_MS = 60_000;
/** Quantas das palavras que esperam a vez já têm a tradução adiantada, com um card por vez. */
const AHEAD_WORDS = 3;
/** O limite de cards por vez nas configurações: mais que isso nunca é consultado. */
const MAX_RECENT_CARDS = 3;
/** Onde procurar a frase de uma palavra buscada: um pouco mais de um minuto de diálogo. */
const RECENT_CAPTIONS = 30;

interface Entry extends WordCandidate {
  senseId: number | null;
  sense: WordSense | null;
  /** A tradução que já chegou, enquanto o resto da resposta da IA não termina. */
  earlyTranslation: string | null;
  firstSeenAt: number;
  firstSentence: string;
  queuedAt: number;
  shownAt: number | null;
  /** Cada palavra só é adiantada uma vez, mesmo que o pedido falhe. */
  askedAhead: boolean;
  /** A pessoa buscou esta palavra, então os filtros das legendas não valem mais para ela. */
  searched: boolean;
  saved: boolean;
}

const newEntry = (candidate: WordCandidate, now: number): Entry => ({
  ...candidate,
  senseId: null,
  sense: null,
  earlyTranslation: null,
  firstSeenAt: now,
  firstSentence: candidate.sentence,
  queuedAt: now,
  shownAt: null,
  askedAhead: false,
  searched: false,
  saved: false,
});

const toRequest = ({ lemma, pos, surface, sentence }: Entry): EnrichRequestWord => ({
  lemma,
  pos,
  surface,
  sentence,
});

export interface VocabularyEmitter {
  card(card: WordCard): void;
  cardUpdate(card: WordCard): void;
  cardRemove(lemma: string): void;
  highlight(text: string, surfaces: string[]): void;
}

export interface VocabularyDeps {
  repos: Repositories;
  pipeline: ReturnType<typeof createPipeline>;
  lookup: ReturnType<typeof createWordLookup>;
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
  private recentCaptions: string[] = [];
  /** Quando entraram os últimos cards, do mais antigo para o mais novo. */
  private recentCards: number[] = [];
  /** Até quando cada card aberto ocupa o lugar dele, pela chave da palavra. */
  private places = new Map<string, number>();
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
    this.recentCaptions = [];
    this.recentCards = [];
    this.places = new Map();
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
    this.enterSession(sessionId);
    this.recentCaptions = [...this.recentCaptions, text].slice(-RECENT_CAPTIONS);
    const { level } = this.deps.settings.get();
    const now = this.deps.now();
    const candidates = this.deps.pipeline(text, {
      level,
      known: this.known,
      sessionCounts: this.counts,
    });

    for (const candidate of this.countSearched(text, candidates)) {
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
        this.entries.set(key, newEntry(candidate, now));
      }
    }
    this.drain(now, text);
  }

  tick(): void {
    this.drain(this.deps.now(), null);
  }

  /** Mostra na hora o card de uma palavra digitada. Devolve falso se o texto não tiver palavra. */
  search(query: string): boolean {
    const candidate = this.deps.lookup(query, {
      sentences: this.recentCaptions,
      sessionCounts: this.counts,
    });
    if (!candidate) return false;

    const now = this.deps.now();
    // A classe da palavra digitada é um palpite, então a mesma palavra é reconhecida só pelo lema.
    const existing = [...this.entries.values()].find((item) => item.lemma === candidate.lemma);
    const entry = existing ?? newEntry(candidate, now);
    const key = wordKey(entry.lemma, entry.pos);
    entry.searched = true;
    this.entries.set(key, entry);
    this.counts.set(key, entry.count);

    if (entry.shownAt == null) {
      this.show(entry, now);
    } else {
      this.takePlace(key, now);
      this.shownOrder = [...this.shownOrder.filter((item) => item !== key), key];
      this.deps.emit.card(this.toCard(entry));
    }
    return true;
  }

  markKnown(lemma: string): void {
    const now = this.deps.now();
    this.deps.repos.known.add(lemma, now);
    this.known.add(lemma);
    for (const [key, entry] of this.entries) {
      if (entry.lemma === lemma) {
        this.entries.delete(key);
        this.places.delete(key);
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

  /** A sessão só existe depois da primeira legenda, e uma palavra pode ter sido buscada antes. */
  private enterSession(sessionId: number) {
    const first = this.sessionId === null;
    this.sessionId = sessionId;
    if (first) this.entries.forEach((entry) => this.persistCount(entry));
  }

  /**
   * Conta as palavras buscadas que aparecem na legenda, mesmo as que os filtros dispensariam. Elas
   * nunca viram outro card nem voltam para a IA, mesmo que a legenda dê outra classe à palavra.
   * Devolve os candidatos que sobram.
   */
  private countSearched(text: string, candidates: WordCandidate[]): WordCandidate[] {
    const searched = [...this.entries.values()].filter((entry) => entry.searched);
    for (const entry of searched) {
      const found = this.deps.lookup(entry.lemma, {
        sentences: [text],
        sessionCounts: this.counts,
      });
      if (!found?.sentence) continue;
      // Sem frase, a palavra ainda não tinha aparecido: esta é a primeira vez, e o card já conta 1.
      if (entry.sentence) entry.count += 1;
      else {
        entry.sentence = found.sentence;
        entry.firstSentence = found.sentence;
        entry.surface = found.surface;
      }
      this.counts.set(wordKey(entry.lemma, entry.pos), entry.count);
      this.persistCount(entry);
      this.deps.emit.cardUpdate(this.toCard(entry));
    }
    return candidates.filter(({ lemma }) => !searched.some((entry) => entry.lemma === lemma));
  }

  /** `captionText` é a legenda que acabou de chegar, ou nulo quando quem chama é o relógio. */
  private drain(now: number, captionText: string | null) {
    const waiting: Entry[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.shownAt != null) continue;
      if (now - entry.queuedAt > WAITING_TTL_MS) this.entries.delete(key);
      else waiting.push(entry);
    }

    waiting.sort((a, b) => b.score - a.score);
    const { cardsAtOnce, highlightSubtitles } = this.deps.settings.get();

    const surfaces: string[] = [];
    while (waiting.length > 0 && this.hasRoomForCard(now)) {
      const next = waiting.find((entry) => this.isTranslated(entry)) ?? waiting[0]!;
      waiting.splice(waiting.indexOf(next), 1);
      this.show(next, now);
      if (next.queuedAt === now) surfaces.push(next.surface);
    }
    if (captionText && highlightSubtitles && surfaces.length > 0) {
      this.deps.emit.highlight(captionText, surfaces);
    }
    this.translateAhead(waiting.slice(0, AHEAD_WORDS + cardsAtOnce - 1));
  }

  /** O próximo card entra quando há um lugar livre e o limite de cards por minuto permite. */
  private hasRoomForCard(now: number): boolean {
    const { cardsPerMinute, cardsAtOnce } = this.deps.settings.get();
    for (const [key, until] of this.places) {
      if (until <= now) this.places.delete(key);
    }
    if (this.places.size >= cardsAtOnce) return false;
    // Vários cards podem entrar juntos, e a média continua sendo a dos cards por minuto.
    const oldest = this.recentCards.at(-cardsAtOnce);
    return oldest === undefined || now - oldest >= (cardsAtOnce * MINUTE_MS) / cardsPerMinute;
  }

  private placeEnd(now: number): number {
    return now + this.deps.settings.get().cardSeconds * 1000;
  }

  private takePlace(key: string, now: number) {
    this.places.set(key, this.placeEnd(now));
    this.recentCards = [...this.recentCards, now].slice(-MAX_RECENT_CARDS);
  }

  private isTranslated(entry: Entry): boolean {
    return (
      entry.earlyTranslation !== null ||
      this.deps.repos.senses.findByLemmaPos(entry.lemma, entry.pos) !== undefined
    );
  }

  private translateAhead(entries: Entry[]) {
    for (const entry of entries) {
      if (entry.askedAhead) continue;
      entry.askedAhead = true;
      if (!this.deps.repos.senses.findByLemmaPos(entry.lemma, entry.pos)) {
        this.queue.addAhead(toRequest(entry));
      }
    }
  }

  private show(entry: Entry, now: number) {
    entry.shownAt = now;
    const key = wordKey(entry.lemma, entry.pos);
    this.takePlace(key, now);
    this.shownOrder.push(key);

    const sense = this.deps.repos.senses.findByLemmaPos(entry.lemma, entry.pos);
    if (sense) this.attachSense(entry, sense);
    else this.queue.add(toRequest(entry));
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
      contextSentence: entry.firstSentence || (entry.sense?.exampleEn ?? ''),
      firstSeenAt: entry.firstSeenAt,
    });
  }

  private enrich(batch: EnrichRequestWord[]): Promise<EnrichedWord[]> {
    const provider = this.deps.getProvider();
    if (!provider) return Promise.reject(new Error('Sem API key configurada.'));
    return provider.enrichWords(batch, (word, translation) =>
      this.handleEarlyTranslation(word, translation),
    );
  }

  private handleEarlyTranslation(request: EnrichRequestWord, translation: string) {
    const entry = this.entries.get(wordKey(request.lemma, request.pos));
    if (!entry || entry.sense) return;
    entry.earlyTranslation = translation;
    if (entry.shownAt != null) this.deps.emit.cardUpdate(this.toCard(entry));
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
    // Palavra adiantada fica só no cache: ela entra na sessão quando o card aparecer.
    const key = wordKey(request.lemma, request.pos);
    const entry = this.entries.get(key);
    if (entry?.shownAt == null) return;
    this.attachSense(entry, sense);
    // O overlay recomeça o tempo do card quando a explicação chega, para dar tempo de ler.
    if (this.places.has(key)) this.places.set(key, this.placeEnd(this.deps.now()));
    this.deps.emit.cardUpdate(this.toCard(entry));
  }

  private toCard(entry: Entry): WordCard {
    const { sense } = entry;
    return {
      lemma: entry.lemma,
      surface: entry.surface,
      pos: entry.pos,
      cefr: (sense?.cefr as WordCard['cefr']) ?? entry.estimatedCefr,
      translation: sense?.translation ?? entry.earlyTranslation,
      explanation: sense?.explanation ?? null,
      // Uma palavra buscada pode não ter aparecido em nenhuma legenda: a frase vem da IA.
      sentence: entry.sentence || (sense?.exampleEn ?? ''),
      extraExample: entry.sentence ? (sense?.exampleEn ?? null) : null,
      count: entry.count,
      saved: entry.saved,
    };
  }
}
