import type { EnrichRequestWord, EnrichedWord, Level, WordCard } from '@legendary/contracts';
import { isDue, isMastered } from '@legendary/core';
import {
  personalCut,
  scoreWord,
  wordKey,
  type createPipeline,
  type createWordLookup,
  type WordCandidate,
} from '@legendary/core/pipeline';
import { EnrichQueue } from '../ai/queue';
import type { LLMProvider } from '../ai/types';
import type { Repositories } from '../db/repositories';
import type { WordSense } from '../db/repositories/senses';
import type { SettingsService } from './settings';

const WAITING_TTL_MS = 30_000;
const ALL_WORDS_WAITING_MS = 10_000;
const MINUTE_MS = 60_000;
const AHEAD_WORDS = 3;
const MAX_RECENT_CARDS = 3;
const RECENT_CAPTIONS = 30;
const REVIEW_BOOST = 2;
const PREFETCH_WORDS = 40;
const TRACK_ATTEMPTS = 5;
const MIN_TRACK_PROBE = 8;

interface Entry extends WordCandidate {
  senseId: number | null;
  sense: WordSense | null;
  provisional: WordSense | null;
  earlyTranslation: string | null;
  firstSeenAt: number;
  firstSentence: string;
  queuedAt: number;
  shownAt: number | null;
  askedAhead: boolean;
  searched: boolean;
  saved: boolean;
}

interface ReviewMark {
  due: boolean;
  mastered: boolean;
}

interface Track {
  cues: readonly string[];
  text: string;
  confirmed: boolean;
  misses: number;
}

const comparable = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();

const newEntry = (candidate: WordCandidate, now: number): Entry => ({
  ...candidate,
  senseId: null,
  sense: null,
  provisional: null,
  earlyTranslation: null,
  firstSeenAt: now,
  firstSentence: candidate.sentence,
  queuedAt: now,
  shownAt: null,
  askedAhead: false,
  searched: false,
  saved: false,
});

const toRequest = ({ lemma, pos, surface, sentence }: EnrichRequestWord): EnrichRequestWord => ({
  lemma,
  pos,
  surface,
  sentence,
});

export interface VocabularyEmitter {
  card(card: WordCard): void;
  cardUpdate(card: WordCard): void;
  cardSeen(card: WordCard): void;
  cardRemove(lemma: string): void;
  highlight(text: string, surfaces: string[]): void;
}

export interface VocabularyDeps {
  repos: Repositories;
  pipeline: ReturnType<typeof createPipeline>;
  lookup: ReturnType<typeof createWordLookup>;
  ranks: ReadonlyMap<string, number>;
  settings: SettingsService;
  getProvider: () => LLMProvider | null;
  now: () => number;
  emit: VocabularyEmitter;
}

export class VocabularyService {
  private readonly queue: EnrichQueue;
  private epoch = 0;
  private sessionId: number | null = null;
  private entries = new Map<string, Entry>();
  private retired = new Map<string, Entry>();
  private counts = new Map<string, number>();
  private known = new Set<string>();
  private studied = new Set<string>();
  private cuts = new Map<Level, number>();
  private reviews = new Map<string, ReviewMark>();
  private createdSenses = new Set<number>();
  private track: Track | null = null;
  private mediaCounts = new Map<string, number>();
  private recentCaptions: string[] = [];
  private recentCards: number[] = [];
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
    return [...this.entries.values()].filter(
      (entry) => entry.shownAt != null && !this.known.has(entry.lemma),
    ).length;
  }

  begin(options: { keepShown?: boolean } = {}): void {
    this.retired = options.keepShown
      ? new Map(
          [...this.entries.values()]
            .filter((entry) => entry.shownAt != null)
            .map((entry) => [entry.lemma, entry]),
        )
      : new Map();
    this.epoch += 1;
    this.sessionId = null;
    this.entries = new Map();
    this.counts = new Map();
    this.known = this.deps.repos.known.all();
    this.studied = this.deps.repos.senses.studiedLemmas();
    this.cuts = new Map();
    this.reviews = this.loadReviews();
    this.createdSenses = new Set();
    this.track = null;
    this.mediaCounts = new Map();
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

  useTrack(cues: readonly string[]): void {
    this.track = { cues, text: comparable(cues.join(' ')), confirmed: false, misses: 0 };
    this.mediaCounts = new Map();
  }

  private cutFor(level: Level): number {
    const cached = this.cuts.get(level);
    if (cached !== undefined) return cached;
    const ranks = (lemmas: Iterable<string>) =>
      [...lemmas].flatMap((lemma) => {
        const rank = this.deps.ranks.get(lemma);
        return rank === undefined ? [] : [rank];
      });
    const cut = personalCut(level, {
      known: ranks(this.known),
      unknown: ranks([...this.studied].filter((lemma) => !this.known.has(lemma))),
    });
    this.cuts.set(level, cut);
    return cut;
  }

  handleCaption(sessionId: number, text: string): void {
    this.enterSession(sessionId);
    this.recentCaptions = [...this.recentCaptions, text].slice(-RECENT_CAPTIONS);
    this.confirmTrack(text);
    const { level, translateAllWords } = this.deps.settings.get();
    const now = this.deps.now();
    const candidates = this.deps.pipeline(text, {
      cut: this.cutFor(level),
      known: this.known,
      sessionCounts: this.counts,
      mediaCounts: this.mediaCounts,
      allWords: translateAllWords,
    });

    for (const found of this.countSearched(text, candidates)) {
      const candidate = this.withReview(
        translateAllWords ? this.withKnownClass(found) : found,
        translateAllWords,
      );
      if (!candidate) continue;
      const key = wordKey(candidate.lemma, candidate.pos);
      this.counts.set(key, candidate.count);
      const entry = this.entries.get(key);
      if (entry?.shownAt != null) {
        entry.count = candidate.count;
        this.persistCount(entry);
        this.announceReturn(entry);
      } else if (entry) {
        Object.assign(entry, candidate, { queuedAt: now });
      } else {
        const fresh = newEntry(candidate, now);
        this.entries.set(key, fresh);
        if (translateAllWords && this.deps.repos.senses.findByLemmaPos(fresh.lemma, fresh.pos)) {
          this.showAsSummary(fresh, now);
        }
      }
    }
    this.drain(now, text);
  }

  tick(): void {
    this.drain(this.deps.now(), null);
  }

  search(query: string): boolean {
    const candidate = this.deps.lookup(query, {
      sentences: this.recentCaptions,
      sessionCounts: this.counts,
    });
    if (!candidate) return false;

    const now = this.deps.now();
    const existing = [...this.entries.values()].find((item) => item.lemma === candidate.lemma);
    const entry = existing ?? newEntry(candidate, now);
    const key = wordKey(entry.lemma, entry.pos);
    entry.searched = true;
    this.entries.set(key, entry);
    this.counts.set(key, entry.count);
    this.studied.add(entry.lemma);
    this.cuts.clear();

    if (entry.shownAt == null) {
      this.show(entry, now);
    } else {
      this.takePlace(key, now);
      this.shownOrder = [...this.shownOrder.filter((item) => item !== key), key];
      this.persistCount(entry);
      this.deps.emit.card(this.toCard(entry));
    }
    return true;
  }

  markKnown(lemma: string): void {
    const now = this.deps.now();
    this.deps.repos.known.add(lemma, now);
    this.known.add(lemma);
    this.cuts.clear();
    for (const [key, entry] of this.entries) {
      if (entry.lemma === lemma) {
        this.entries.delete(key);
        this.places.delete(key);
        this.shownOrder = this.shownOrder.filter((item) => item !== key);
      }
    }
    this.deps.emit.cardRemove(lemma);
  }

  unmarkKnown(lemma: string): void {
    this.deps.repos.known.remove(lemma);
    this.known.delete(lemma);
    this.cuts.clear();
    const entry = this.findEntry(lemma);
    if (entry) this.deps.emit.cardUpdate(this.toCard(entry));
  }

  markCurrentKnown(): void {
    const key = this.shownOrder.at(-1);
    const entry = key ? this.entries.get(key) : undefined;
    if (entry && !this.known.has(entry.lemma)) this.markKnown(entry.lemma);
  }

  toggleSaved(lemma: string): boolean {
    const entry = this.findEntry(lemma);
    if (!entry) return false;
    entry.saved =
      entry.senseId === null
        ? !entry.saved
        : this.deps.repos.saved.toggle(entry.senseId, this.deps.now());
    this.deps.emit.cardUpdate(this.toCard(entry));
    return entry.saved;
  }

  private findEntry(lemma: string): Entry | undefined {
    return (
      [...this.entries.values()].find((item) => item.lemma === lemma) ?? this.retired.get(lemma)
    );
  }

  private loadReviews(): Map<string, ReviewMark> {
    const now = this.deps.now();
    const marks = new Map<string, ReviewMark>();
    for (const row of this.deps.repos.reviews.byWord()) {
      const key = wordKey(row.lemma, row.pos);
      const mark = marks.get(key) ?? { due: false, mastered: false };
      marks.set(key, {
        due: mark.due || isDue(row, now),
        mastered: mark.mastered || isMastered(row, now),
      });
    }
    marks.forEach((mark) => {
      if (mark.due) mark.mastered = false;
    });
    return marks;
  }

  private withReview(candidate: WordCandidate, allWords: boolean): WordCandidate | null {
    const mark = this.reviews.get(wordKey(candidate.lemma, candidate.pos));
    if (mark?.mastered && !allWords) return null;
    return mark?.due ? { ...candidate, score: candidate.score * REVIEW_BOOST } : candidate;
  }

  private confirmTrack(text: string) {
    const track = this.track;
    if (!track || track.confirmed) return;
    const probe = comparable(text);
    if (probe.length < MIN_TRACK_PROBE) return;
    if (track.text.includes(probe)) {
      track.confirmed = true;
      this.prepareTrack(track.cues);
      return;
    }
    track.misses += 1;
    if (track.misses >= TRACK_ATTEMPTS) this.track = null;
  }

  private prepareTrack(cues: readonly string[]) {
    const { level, translateAllWords } = this.deps.settings.get();
    const context = {
      cut: this.cutFor(level),
      known: this.known,
      sessionCounts: new Map<string, number>(),
      allWords: translateAllWords,
    };
    const counts = new Map<string, number>();
    const firsts = new Map<string, WordCandidate>();
    for (const cue of cues) {
      for (const candidate of this.deps.pipeline(cue, context)) {
        const key = wordKey(candidate.lemma, candidate.pos);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (!firsts.has(key)) firsts.set(key, candidate);
      }
    }
    this.mediaCounts = counts;

    const worth = ([key, candidate]: [string, WordCandidate]) =>
      scoreWord({ count: counts.get(key) ?? 1, rank: candidate.rank });
    const picked = new Set(
      [...firsts]
        .filter(
          ([, candidate]) => !this.deps.repos.senses.findByLemmaPos(candidate.lemma, candidate.pos),
        )
        .sort((a, b) => worth(b) - worth(a))
        .slice(0, PREFETCH_WORDS)
        .map(([key]) => key),
    );
    for (const [key, candidate] of firsts) {
      if (picked.has(key)) this.queue.addAhead(toRequest(candidate));
    }
  }

  private enterSession(sessionId: number) {
    const first = this.sessionId === null;
    this.sessionId = sessionId;
    if (first) this.entries.forEach((entry) => this.persistCount(entry));
  }

  private countSearched(text: string, candidates: WordCandidate[]): WordCandidate[] {
    const searched = [...this.entries.values()].filter((entry) => entry.searched);
    for (const entry of searched) {
      const found = this.deps.lookup(entry.lemma, {
        sentences: [text],
        sessionCounts: this.counts,
      });
      if (!found?.sentence) continue;
      if (entry.sentence) entry.count += 1;
      else {
        entry.sentence = found.sentence;
        entry.firstSentence = found.sentence;
        entry.surface = found.surface;
      }
      this.counts.set(wordKey(entry.lemma, entry.pos), entry.count);
      this.persistCount(entry);
      this.announceReturn(entry);
    }
    return candidates.filter(({ lemma }) => !searched.some((entry) => entry.lemma === lemma));
  }

  private withKnownClass(candidate: WordCandidate): WordCandidate {
    const entry = [...this.entries.values()].find((item) => item.lemma === candidate.lemma);
    const pos = entry?.pos ?? this.deps.repos.senses.findByLemma(candidate.lemma)?.pos;
    if (!pos || pos === candidate.pos) return candidate;
    return {
      ...candidate,
      pos,
      count: (this.counts.get(wordKey(candidate.lemma, pos)) ?? 0) + 1,
    };
  }

  private announceReturn(entry: Entry) {
    const { translateAllWords } = this.deps.settings.get();
    const climbs = translateAllWords && !this.known.has(entry.lemma);
    const emit = climbs ? this.deps.emit.cardSeen : this.deps.emit.cardUpdate;
    emit(this.toCard(entry));
  }

  private drain(now: number, captionText: string | null) {
    const { cardsAtOnce, highlightSubtitles, translateAllWords } = this.deps.settings.get();
    const patience = translateAllWords ? ALL_WORDS_WAITING_MS : WAITING_TTL_MS;
    const waiting: Entry[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.shownAt != null) continue;
      if (now - entry.queuedAt <= patience) waiting.push(entry);
      else if (translateAllWords) this.showAsSummary(entry, now);
      else this.entries.delete(key);
    }

    const translated = new Set(waiting.filter((entry) => this.isTranslated(entry)));
    waiting.sort(
      (a, b) => b.score - a.score || Number(translated.has(b)) - Number(translated.has(a)),
    );

    const surfaces: string[] = [];
    while (waiting.length > 0 && this.hasRoomForCard(now)) {
      const next = waiting.shift()!;
      this.show(next, now);
      if (next.queuedAt === now) surfaces.push(next.surface);
    }
    if (captionText && highlightSubtitles && surfaces.length > 0) {
      this.deps.emit.highlight(captionText, surfaces);
    }
    this.translateAhead(
      translateAllWords ? waiting : waiting.slice(0, AHEAD_WORDS + cardsAtOnce - 1),
    );
  }

  private hasRoomForCard(now: number): boolean {
    const { cardsPerMinute, cardsAtOnce } = this.deps.settings.get();
    for (const [key, until] of this.places) {
      if (until <= now) this.places.delete(key);
    }
    if (this.places.size >= cardsAtOnce) return false;
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
      entry.provisional !== null ||
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
    this.loadTranslation(entry, true);
    this.deps.emit.card(this.toCard(entry));
  }

  private showAsSummary(entry: Entry, now: number) {
    entry.shownAt = now;
    this.shownOrder.unshift(wordKey(entry.lemma, entry.pos));
    this.loadTranslation(entry, false);
    this.deps.emit.cardSeen(this.toCard(entry));
  }

  private loadTranslation(entry: Entry, matchScene: boolean) {
    const senses = this.deps.repos.senses.findAllByLemmaPos(entry.lemma, entry.pos);
    const [first] = senses;
    if (!first) {
      this.queue.add(toRequest(entry));
      return;
    }
    const created = senses.find((sense) => this.createdSenses.has(sense.id));
    const provider = this.deps.getProvider();
    const ambiguous = senses.some((sense) => sense.polysemous);
    if (created || !matchScene || !provider || !entry.sentence || !ambiguous) {
      this.attachSense(entry, created ?? first);
      return;
    }
    entry.provisional = first;
    void this.matchSense(provider, entry, senses);
  }

  private async matchSense(provider: LLMProvider, entry: Entry, senses: WordSense[]) {
    const epoch = this.epoch;
    const key = wordKey(entry.lemma, entry.pos);
    let index: number | null;
    try {
      index = await provider.matchSense(toRequest(entry), senses);
    } catch {
      index = 0;
    }
    if (epoch !== this.epoch || this.entries.get(key) !== entry || entry.sense) return;
    entry.provisional = null;
    const sense = index === null ? undefined : senses[index];
    if (sense) this.attachSense(entry, sense);
    else this.queue.add(toRequest(entry));
    this.deps.emit.cardUpdate(this.toCard(entry));
  }

  private attachSense(entry: Entry, sense: WordSense) {
    entry.sense = sense;
    entry.senseId = sense.id;
    entry.provisional = null;
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
      searched: entry.searched,
    });
  }

  private enrich(batch: EnrichRequestWord[]): Promise<EnrichedWord[]> {
    const provider = this.deps.getProvider();
    if (!provider) return Promise.reject(new Error('Sem API key configurada.'));
    return provider.enrichWords(batch, {
      level: this.deps.settings.get().level,
      onTranslation: (word, translation) => this.handleEarlyTranslation(word, translation),
    });
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
      polysemous: result.polysemous,
      provider: this.deps.getProvider()?.name ?? 'unknown',
    });
    this.createdSenses.add(sense.id);
    const key = wordKey(request.lemma, request.pos);
    const entry = this.entries.get(key);
    if (entry?.shownAt == null) return;
    this.attachSense(entry, sense);
    if (this.places.has(key)) this.places.set(key, this.placeEnd(this.deps.now()));
    this.deps.emit.cardUpdate(this.toCard(entry));
  }

  private toCard(entry: Entry): WordCard {
    const sense = entry.sense ?? entry.provisional;
    return {
      lemma: entry.lemma,
      surface: entry.surface,
      pos: entry.pos,
      cefr: (sense?.cefr as WordCard['cefr']) ?? entry.estimatedCefr,
      translation: sense?.translation ?? entry.earlyTranslation,
      explanation: sense?.explanation ?? null,
      sentence: entry.sentence || (sense?.exampleEn ?? ''),
      extraExample: entry.sentence ? (sense?.exampleEn ?? null) : null,
      count: entry.count,
      saved: entry.saved,
      known: this.known.has(entry.lemma),
    };
  }
}
