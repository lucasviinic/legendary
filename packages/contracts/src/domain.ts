import { z } from 'zod';
import { QuestionTypeSchema } from './ai';
import {
  CardPlacementSchema,
  CaptureOriginSchema,
  CefrSchema,
  CornerSchema,
  LevelSchema,
  ProviderSchema,
  SourceSchema,
} from './common';
import { DEFAULT_WS_PORT } from './ws';

export const WordCardSchema = z.object({
  lemma: z.string(),
  /** Como a palavra apareceu na legenda, para sublinhar na frase. */
  surface: z.string(),
  pos: z.string(),
  cefr: CefrSchema.nullable(),
  /** Nulo enquanto a IA não respondeu: o card aparece antes da tradução. */
  translation: z.string().nullable(),
  explanation: z.string().nullable(),
  sentence: z.string(),
  extraExample: z.string().nullable(),
  count: z.number().int().positive(),
  saved: z.boolean(),
});
export type WordCard = z.infer<typeof WordCardSchema>;

export const SessionStateSchema = z.enum(['idle', 'active', 'paused']);
export type SessionState = z.infer<typeof SessionStateSchema>;

export const SessionNoticeSchema = z.enum(['no_captions', 'ai_error']);
export type SessionNotice = z.infer<typeof SessionNoticeSchema>;

export const SessionStatusSchema = z.object({
  state: SessionStateSchema,
  elapsedMs: z.number().nonnegative(),
  newWords: z.number().int().nonnegative(),
  source: SourceSchema.nullable(),
  origin: CaptureOriginSchema,
  notice: SessionNoticeSchema.nullable(),
  queuedWords: z.number().int().nonnegative(),
});
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SettingsSchema = z.object({
  provider: ProviderSchema,
  level: LevelSchema,
  cardsPerMinute: z.number().int().min(1).max(10),
  /** Quantos cards ficam resumidos abaixo do atual. */
  maxSummaries: z.number().int().min(1).max(10),
  corner: CornerSchema,
  /** Posição arrastada em cada monitor, pelo nome dele. Sem ela, vale o canto escolhido. */
  cardPlacements: z.record(z.string(), CardPlacementSchema),
  highlightSubtitles: z.boolean(),
  /** Volta o vídeo ao buscar uma palavra, para a pessoa ouvir de novo. */
  rewindOnSearch: z.boolean(),
  origin: CaptureOriginSchema,
  wsPort: z.number().int().min(1024).max(65535),
  onboarded: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const defaultSettings: Settings = {
  provider: 'gemini',
  level: 'B2',
  cardsPerMinute: 2,
  maxSummaries: 6,
  corner: 'tr',
  cardPlacements: {},
  highlightSubtitles: true,
  rewindOnSearch: false,
  origin: 'browser',
  wsPort: DEFAULT_WS_PORT,
  onboarded: false,
};

export const ApiKeyStatusSchema = z.enum(['missing', 'untested', 'ok', 'invalid']);
export type ApiKeyStatus = z.infer<typeof ApiKeyStatusSchema>;

/** A chave em si nunca sai do processo main: o renderer só recebe a máscara. */
export const ApiKeyInfoSchema = z.object({
  mask: z.string().nullable(),
  status: ApiKeyStatusSchema,
});
export type ApiKeyInfo = z.infer<typeof ApiKeyInfoSchema>;

export const PairingSchema = z.object({
  token: z.string(),
  port: z.number().int(),
  connected: z.boolean(),
});
export type Pairing = z.infer<typeof PairingSchema>;

export const SettingsViewSchema = z.object({
  settings: SettingsSchema,
  keys: z.record(ProviderSchema, ApiKeyInfoSchema),
  pairing: PairingSchema,
});
export type SettingsView = z.infer<typeof SettingsViewSchema>;

/** O que o overlay precisa saber para arrumar a pilha na tela em que está. */
export const OverlayLayoutSchema = z.object({
  placement: CardPlacementSchema,
  /** Altura da faixa da barra de menus, que a janela do overlay também cobre. */
  safeTop: z.number().nonnegative(),
  maxSummaries: SettingsSchema.shape.maxSummaries,
});
export type OverlayLayout = z.infer<typeof OverlayLayoutSchema>;

export const QuizSummaryWordSchema = z.object({
  senseId: z.number().int(),
  word: z.string(),
  translation: z.string(),
  selected: z.boolean(),
});
export type QuizSummaryWord = z.infer<typeof QuizSummaryWordSchema>;

export const QuizSummarySchema = z.object({
  sessionId: z.number().int(),
  title: z.string(),
  durationMs: z.number().nonnegative(),
  newWords: z.number().int().nonnegative(),
  savedWords: z.number().int().nonnegative(),
  words: z.array(QuizSummaryWordSchema),
});
export type QuizSummary = z.infer<typeof QuizSummarySchema>;

/** Questão como chega ao renderer: sem a resposta, porque a correção é feita no main. */
export const QuizQuestionViewSchema = z.object({
  id: z.number().int(),
  type: QuestionTypeSchema,
  prompt: z.string(),
  options: z.array(z.string()).nullable(),
  /** Coluna da esquerda da questão de associar. */
  matchWords: z.array(z.string()).nullable(),
  /** Linha discreta com a origem da frase, como "Northbound · T1E3 · 12:04". */
  context: z.string().nullable(),
});
export type QuizQuestionView = z.infer<typeof QuizQuestionViewSchema>;

export const QuizViewSchema = z.object({
  quizId: z.number().int(),
  questions: z.array(QuizQuestionViewSchema),
});
export type QuizView = z.infer<typeof QuizViewSchema>;

export const QuizAnswerResultSchema = z.object({
  correct: z.boolean(),
  correctAnswer: z.string(),
  word: z.string(),
  translation: z.string(),
  explanation: z.string(),
  /** Na questão de associar, o resultado de cada par. */
  matchResults: z
    .array(z.object({ word: z.string(), meaning: z.string(), correct: z.boolean() }))
    .nullable(),
});
export type QuizAnswerResult = z.infer<typeof QuizAnswerResultSchema>;

export const QuizMistakeSchema = z.object({
  word: z.string(),
  type: QuestionTypeSchema,
  userAnswer: z.string(),
  correctAnswer: z.string(),
  explanation: z.string(),
});
export type QuizMistake = z.infer<typeof QuizMistakeSchema>;

export const QuizResultSchema = z.object({
  quizId: z.number().int(),
  sessionId: z.number().int(),
  score: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  mistakes: z.array(QuizMistakeSchema),
});
export type QuizResult = z.infer<typeof QuizResultSchema>;

export const HistorySessionSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  source: SourceSchema,
  startedAt: z.number(),
  durationMs: z.number().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  quiz: z.object({ score: z.number().int(), total: z.number().int() }).nullable(),
});
export type HistorySession = z.infer<typeof HistorySessionSchema>;

export const HistoryListSchema = z.object({
  sessions: z.array(HistorySessionSchema),
  counts: z.object({
    all: z.number().int(),
    saved: z.number().int(),
    dueToday: z.number().int(),
  }),
});
export type HistoryList = z.infer<typeof HistoryListSchema>;

export const HistoryScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('saved') }),
  z.object({ kind: z.literal('due') }),
  z.object({ kind: z.literal('session'), sessionId: z.number().int() }),
]);
export type HistoryScope = z.infer<typeof HistoryScopeSchema>;

export const HistoryFilterSchema = z.enum(['all', 'saved', 'wrong', 'B1', 'B2', 'C1']);
export type HistoryFilter = z.infer<typeof HistoryFilterSchema>;

export const HistoryWordsRequestSchema = z.object({
  scope: HistoryScopeSchema,
  filter: HistoryFilterSchema,
  search: z.string().max(200),
  limit: z.number().int().min(1).max(500),
  offset: z.number().int().nonnegative(),
});
export type HistoryWordsRequest = z.infer<typeof HistoryWordsRequestSchema>;

export const HistoryWordSchema = z.object({
  senseId: z.number().int(),
  lemma: z.string(),
  translation: z.string(),
  seen: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
  cefr: CefrSchema.nullable(),
  /** Nulo quando a palavra ainda não passou por um quiz. */
  dueAt: z.number().nullable(),
  saved: z.boolean(),
});
export type HistoryWord = z.infer<typeof HistoryWordSchema>;

export const HistoryWordsSchema = z.object({
  rows: z.array(HistoryWordSchema),
  total: z.number().int().nonnegative(),
});
export type HistoryWords = z.infer<typeof HistoryWordsSchema>;
