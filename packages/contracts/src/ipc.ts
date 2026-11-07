import { z } from 'zod';
import { CaptureOriginSchema, ProviderSchema } from './common';
import {
  HistoryListSchema,
  HistoryWordsRequestSchema,
  HistoryWordsSchema,
  QuizAnswerResultSchema,
  QuizResultSchema,
  QuizSummarySchema,
  QuizViewSchema,
  SessionStatusSchema,
  SettingsSchema,
  SettingsViewSchema,
  WordCardSchema,
} from './domain';

const None = z.undefined();

export const WindowNameSchema = z.enum(['history', 'settings', 'onboarding']);
export type WindowName = z.infer<typeof WindowNameSchema>;

/** Canais renderer → main. O preload só expõe estes, e o main valida cada payload. */
export const invokeChannels = {
  'session:start': { request: z.object({ source: CaptureOriginSchema }), response: None },
  'session:stop': { request: None, response: None },
  'session:toggle-pause': { request: None, response: None },
  'session:get-status': { request: None, response: SessionStatusSchema },

  'vocab:mark-known': { request: z.object({ lemma: z.string() }), response: None },
  'vocab:save': {
    request: z.object({ lemma: z.string() }),
    response: z.object({ saved: z.boolean() }),
  },

  'overlay:set-interactive': { request: z.object({ interactive: z.boolean() }), response: None },
  'overlay:toggle': { request: None, response: None },

  'quiz:summary': {
    request: z.object({ sessionId: z.number().int() }),
    response: QuizSummarySchema,
  },
  'quiz:get': {
    request: z.object({ sessionId: z.number().int(), senseIds: z.array(z.number().int()) }),
    response: QuizViewSchema,
  },
  'quiz:review-mistakes': {
    request: z.object({ quizId: z.number().int() }),
    response: QuizViewSchema,
  },
  'quiz:answer': {
    request: z.object({ questionId: z.number().int(), answer: z.string().max(4000) }),
    response: QuizAnswerResultSchema,
  },
  'quiz:finish': { request: z.object({ quizId: z.number().int() }), response: QuizResultSchema },
  'quiz:open': { request: z.object({ sessionId: z.number().int() }), response: None },

  'history:list': { request: None, response: HistoryListSchema },
  'history:words': { request: HistoryWordsRequestSchema, response: HistoryWordsSchema },

  'settings:get': { request: None, response: SettingsViewSchema },
  'settings:set': { request: SettingsSchema.partial(), response: SettingsViewSchema },
  'settings:set-api-key': {
    request: z.object({ provider: ProviderSchema, key: z.string().min(1).max(500) }),
    response: SettingsViewSchema,
  },

  'window:open': { request: z.object({ window: WindowNameSchema }), response: None },
  'window:close-current': { request: None, response: None },
  'app:quit': { request: None, response: None },
} as const;

/** Canais main → renderer. */
export const eventChannels = {
  'session:status': SessionStatusSchema,
  'vocab:card': WordCardSchema,
  'vocab:card-remove': z.object({ lemma: z.string() }),
  'overlay:visibility': z.object({ visible: z.boolean() }),
  'settings:changed': SettingsViewSchema,
} as const;

export type InvokeChannel = keyof typeof invokeChannels;
export type InvokeRequest<C extends InvokeChannel> = z.infer<(typeof invokeChannels)[C]['request']>;
export type InvokeResponse<C extends InvokeChannel> = z.infer<
  (typeof invokeChannels)[C]['response']
>;

export type EventChannel = keyof typeof eventChannels;
export type EventPayload<C extends EventChannel> = z.infer<(typeof eventChannels)[C]>;

/** API que o preload expõe em `window.legendary`. */
export interface LegendaryApi {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...payload: InvokeRequest<C> extends undefined ? [] : [InvokeRequest<C>]
  ): Promise<InvokeResponse<C>>;
  on<C extends EventChannel>(channel: C, listener: (payload: EventPayload<C>) => void): () => void;
}
