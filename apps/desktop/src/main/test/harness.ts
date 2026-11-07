import { join } from 'node:path';
import { vi } from 'vitest';
import type {
  EnrichRequestWord,
  EnrichedWord,
  QuizQuestionDraft,
  Settings,
} from '@legendary/contracts';
import type { Lexicon } from '@legendary/core/pipeline';
import { createPipeline, createWordLookup } from '@legendary/core/pipeline';
import type { LLMProvider } from '../ai/types';
import { openDatabase } from '../db/client';
import { createRepositories } from '../db/repositories';
import { HistoryService } from '../services/history';
import { QuizService } from '../services/quiz';
import type { SecretStore } from '../services/secrets';
import { SessionService } from '../services/session';
import { SettingsService } from '../services/settings';
import { VocabularyService } from '../services/vocabulary';

export const lexicon: Lexicon = {
  ranks: new Map([
    ['house', 400],
    ['reckon', 4000],
    ['grumpy', 9000],
    ['wary', 11000],
    ['hunch', 12000],
    ['knack', 13000],
  ]),
  phrases: [{ text: 'head out', kind: 'phrasal verb' }],
};

export const enriched = (word: EnrichRequestWord): EnrichedWord => ({
  lemma: word.lemma,
  pos: word.pos,
  translation: `tradução de ${word.lemma}`,
  explanation: `explicação de ${word.lemma}`,
  exampleEn: `Example of ${word.lemma}.`,
  examplePt: `Exemplo de ${word.lemma}.`,
  cefr: 'B2',
});

export function fakeProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    name: 'gemini',
    enrichWords: vi.fn(async (batch: EnrichRequestWord[]) => batch.map(enriched)),
    generateQuiz: vi.fn(async (): Promise<QuizQuestionDraft[]> => {
      throw new Error('sem quiz da IA neste teste');
    }),
    check: vi.fn(async () => undefined),
    ...overrides,
  };
}

export function memorySecrets(initial: Record<string, string> = {}): SecretStore {
  const values = new Map(Object.entries(initial));
  return {
    get: (provider) => values.get(provider) ?? null,
    set: (provider, key) => void values.set(provider, key),
  };
}

export function createHarness(
  options: {
    provider?: LLMProvider | null;
    settings?: Partial<Settings>;
  } = {},
) {
  const { db, close } = openDatabase(
    ':memory:',
    join(__dirname, '../../../../../packages/db/migrations'),
  );
  const repos = createRepositories(db);
  /** `step` faz o tempo passar a cada leitura, como acontece com o relógio de verdade. */
  const clock = { now: 1_000_000, step: 0 };
  const now = () => (clock.now += clock.step);
  const provider = options.provider === undefined ? fakeProvider() : options.provider;

  const settings = new SettingsService({ repo: repos.settings, secrets: memorySecrets() });
  settings.update({ cardsPerMinute: 4, ...options.settings });

  const events = {
    cards: [] as import('@legendary/contracts').WordCard[],
    updates: [] as import('@legendary/contracts').WordCard[],
    removed: [] as string[],
    highlights: [] as { text: string; surfaces: string[] }[],
    statuses: [] as import('@legendary/contracts').SessionStatus[],
  };

  const vocabulary = new VocabularyService({
    repos,
    pipeline: createPipeline(lexicon),
    lookup: createWordLookup(lexicon),
    settings,
    getProvider: () => provider,
    now,
    emit: {
      card: (card) => events.cards.push(card),
      cardUpdate: (card) => events.updates.push(card),
      cardRemove: (lemma) => events.removed.push(lemma),
      highlight: (text, surfaces) => events.highlights.push({ text, surfaces }),
    },
  });

  const session = new SessionService({
    repos,
    vocabulary,
    now,
    emitStatus: (status) => events.statuses.push(status),
  });

  const quiz = new QuizService({
    repos,
    getProvider: () => provider,
    now,
    shuffle: <T>(items: T[]) => items,
  });
  const history = new HistoryService({ repos, now });

  return {
    db,
    close,
    repos,
    clock,
    provider,
    settings,
    events,
    vocabulary,
    session,
    quiz,
    history,
  };
}
