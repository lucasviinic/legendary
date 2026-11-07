import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  EnrichResponseSchema,
  QuizResponseSchema,
  type EnrichRequestWord,
  type Provider,
} from '@legendary/contracts';
import { generateObject, generateText, Output, streamText, type LanguageModel } from 'ai';
import { buildEnrichPrompt } from './prompts/enrich';
import { buildQuizPrompt } from './prompts/quiz';
import type { LLMProvider, OnTranslation } from './types';

const ENRICH_TIMEOUT_MS = 60_000;
const QUIZ_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 16_000;

type Task = 'enrich' | 'quiz';

/** A tradução precisa ser rápida; o quiz pode usar um modelo mais forte. */
const MODEL_IDS: Record<Provider, Record<Task, string>> = {
  gemini: { enrich: 'gemini-2.5-flash', quiz: 'gemini-2.5-flash' },
  claude: { enrich: 'claude-haiku-5-5', quiz: 'claude-opus-5-5' },
  deepseek: { enrich: 'deepseek-v4-flash', quiz: 'deepseek-v4-flash' },
};

function createModel(provider: Provider, task: Task, apiKey: string): LanguageModel {
  const modelId = MODEL_IDS[provider][task];
  switch (provider) {
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case 'claude':
      return createAnthropic({ apiKey })(modelId);
    case 'deepseek':
      return createDeepSeek({ apiKey })(modelId);
  }
}

/** Traduzir uma palavra não pede raciocínio, e raciocinar atrasaria o início da resposta. */
const ENRICH_OPTIONS = {
  gemini: { google: { thinkingConfig: { thinkingBudget: 0 } } },
  claude: { anthropic: { effort: 'low' as const, thinking: { type: 'disabled' as const } } },
  deepseek: { deepseek: { thinking: { type: 'disabled' as const } } },
} satisfies Record<Provider, unknown>;

/** No Claude: esforço baixo para responder rápido, e outro modelo assume se o pedido for recusado. */
const quizOptions = (provider: Provider) =>
  provider === 'claude'
    ? { anthropic: { effort: 'low' as const, fallbacks: 'default' as const } }
    : undefined;

interface PartialWord {
  lemma?: string | undefined;
  translation?: string | undefined;
}

/** A tradução está completa quando a IA já começou a escrever o campo seguinte. */
function completedTranslation(word: PartialWord): string | null {
  const fields = Object.keys(word);
  return word.translation && fields.at(-1) !== 'translation' ? word.translation : null;
}

/** Acompanha a resposta enquanto ela chega e avisa cada tradução uma única vez. */
function translationAnnouncer(batch: EnrichRequestWord[], onTranslation?: OnTranslation) {
  const announced = new Set<EnrichRequestWord>();
  return (words: readonly (PartialWord | undefined)[]) => {
    words.forEach((word, position) => {
      const translation = word && completedTranslation(word);
      if (!translation) return;
      const request = batch.find((item) => item.lemma === word.lemma) ?? batch[position];
      if (!request || announced.has(request)) return;
      announced.add(request);
      onTranslation?.(request, translation);
    });
  };
}

export function createProvider(provider: Provider, apiKey: string): LLMProvider {
  const enrichModel = createModel(provider, 'enrich', apiKey);
  const quizModel = createModel(provider, 'quiz', apiKey);

  return {
    name: provider,

    async enrichWords(batch, onTranslation) {
      // Um erro no streaming não é lançado: ele só chega por aqui, e sem isto a fila ficaria parada.
      let failure: unknown;
      const result = streamText({
        model: enrichModel,
        output: Output.object({ schema: EnrichResponseSchema }),
        ...buildEnrichPrompt(batch),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // As novas tentativas ficam com a fila.
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
        providerOptions: ENRICH_OPTIONS[provider],
        onError: ({ error }) => {
          failure = error;
        },
      });

      const announce = translationAnnouncer(batch, onTranslation);
      for await (const partial of result.partialOutputStream) {
        announce(partial.words ?? []);
      }
      if (failure) throw failure;

      const { words } = await result.output;
      return words;
    },

    async generateQuiz(words) {
      const { object } = await generateObject({
        model: quizModel,
        schema: QuizResponseSchema,
        ...buildQuizPrompt(words),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(QUIZ_TIMEOUT_MS),
        providerOptions: quizOptions(provider),
      });
      return object.questions;
    },

    async check() {
      await generateText({
        model: enrichModel,
        prompt: 'Responda apenas: ok',
        maxOutputTokens: 200,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
        providerOptions: ENRICH_OPTIONS[provider],
      });
    },
  };
}
