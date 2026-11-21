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
  surface: z.string(),
  pos: z.string(),
  cefr: CefrSchema.nullable(),
  translation: z.string().nullable(),
  explanation: z.string().nullable(),
  sentence: z.string(),
  extraExample: z.string().nullable(),
  count: z.number().int().positive(),
  saved: z.boolean(),
  known: z.boolean(),
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
  translateAllWords: z.boolean(),
  cardsPerMinute: z.number().int().min(1).max(15),
  cardSeconds: z.number().int().min(3).max(30),
  cardsAtOnce: z.number().int().min(1).max(3),
  maxSummaries: z.number().int().min(1).max(12),
  corner: CornerSchema,
  cardPlacements: z.record(z.string(), CardPlacementSchema),
  highlightSubtitles: z.boolean(),
  rewindOnSearch: z.boolean(),
  quizQuestions: z.number().int().min(5).max(20),
  origin: CaptureOriginSchema,
  wsPort: z.number().int().min(1024).max(65535),
  onboarded: z.boolean(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const defaultSettings: Settings = {
  provider: 'gemini',
  level: 'B2',
  translateAllWords: false,
  cardsPerMinute: 2,
  cardSeconds: 10,
  cardsAtOnce: 1,
  maxSummaries: 6,
  corner: 'tr',
  cardPlacements: {},
  highlightSubtitles: true,
  rewindOnSearch: false,
  quizQuestions: 10,
  origin: 'browser',
  wsPort: DEFAULT_WS_PORT,
  onboarded: false,
};

export const ApiKeyStatusSchema = z.enum(['missing', 'untested', 'ok', 'invalid']);
export type ApiKeyStatus = z.infer<typeof ApiKeyStatusSchema>;

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

export const OverlayLayoutSchema = z.object({
  placement: CardPlacementSchema,
  safeTop: z.number().nonnegative(),
  maxSummaries: SettingsSchema.shape.maxSummaries,
  cardSeconds: SettingsSchema.shape.cardSeconds,
  cardsAtOnce: SettingsSchema.shape.cardsAtOnce,
});
export type OverlayLayout = z.infer<typeof OverlayLayoutSchema>;

export const QuizSummaryWordSchema = z.object({
  senseId: z.number().int(),
  word: z.string(),
  translation: z.string(),
  selected: z.boolean(),
});
export type QuizSummaryWord = z.infer<typeof QuizSummaryWordSchema>;

export const TriageWordSchema = z.object({
  senseId: z.number().int(),
  word: z.string(),
  pos: z.string(),
  cefr: CefrSchema.nullable(),
  translation: z.string(),
  sentence: z.string(),
});
export type TriageWord = z.infer<typeof TriageWordSchema>;

export const QuizSummarySchema = z.object({
  sessionId: z.number().int(),
  title: z.string(),
  durationMs: z.number().nonnegative(),
  newWords: z.number().int().nonnegative(),
  savedWords: z.number().int().nonnegative(),
  maxQuestions: z.number().int().positive(),
  words: z.array(QuizSummaryWordSchema),
});
export type QuizSummary = z.infer<typeof QuizSummarySchema>;

export const QuizQuestionViewSchema = z.object({
  id: z.number().int(),
  type: QuestionTypeSchema,
  prompt: z.string(),
  options: z.array(z.string()).nullable(),
  matchWords: z.array(z.string()).nullable(),
  context: z.string().nullable(),
});
export type QuizQuestionView = z.infer<typeof QuizQuestionViewSchema>;

export const QuizViewSchema = z.object({
  quizId: z.number().int(),
  questions: z.array(QuizQuestionViewSchema),
  total: z.number().int().nonnegative(),
});
export type QuizView = z.infer<typeof QuizViewSchema>;

export const QuizAnswerResultSchema = z.object({
  correct: z.boolean(),
  correctAnswer: z.string(),
  word: z.string(),
  translation: z.string(),
  explanation: z.string(),
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
  dueAt: z.number().nullable(),
  saved: z.boolean(),
});
export type HistoryWord = z.infer<typeof HistoryWordSchema>;

export const HistoryWordsSchema = z.object({
  rows: z.array(HistoryWordSchema),
  total: z.number().int().nonnegative(),
});
export type HistoryWords = z.infer<typeof HistoryWordsSchema>;
