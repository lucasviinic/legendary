import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { EnrichResponseSchema, QuizResponseSchema, type Provider } from '@legendary/contracts';
import { generateObject, generateText, type LanguageModel } from 'ai';
import { buildEnrichPrompt } from './prompts/enrich';
import { buildQuizPrompt } from './prompts/quiz';
import type { LLMProvider } from './types';

const ENRICH_TIMEOUT_MS = 60_000;
const QUIZ_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 16_000;

/** Cada provedor com o modelo padrão. */
function createModel(provider: Provider, apiKey: string): LanguageModel {
  switch (provider) {
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey })('gemini-2.5-flash');
    case 'claude':
      return createAnthropic({ apiKey })('claude-opus-5-5');
    case 'deepseek':
      return createDeepSeek({ apiKey })('deepseek-v4-flash');
  }
}

const providerOptions = (provider: Provider) =>
  // No Claude: esforço baixo para responder rápido, e outro modelo assume se o pedido for recusado.
  provider === 'claude'
    ? { anthropic: { effort: 'low' as const, fallbacks: 'default' as const } }
    : undefined;

export function createProvider(provider: Provider, apiKey: string): LLMProvider {
  const model = createModel(provider, apiKey);
  const options = providerOptions(provider);

  return {
    name: provider,

    async enrichWords(batch) {
      const { object } = await generateObject({
        model,
        schema: EnrichResponseSchema,
        ...buildEnrichPrompt(batch),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        // As novas tentativas ficam com a fila.
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
        providerOptions: options,
      });
      return object.words;
    },

    async generateQuiz(words) {
      const { object } = await generateObject({
        model,
        schema: QuizResponseSchema,
        ...buildQuizPrompt(words),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(QUIZ_TIMEOUT_MS),
        providerOptions: options,
      });
      return object.questions;
    },

    async check() {
      await generateText({
        model,
        prompt: 'Responda apenas: ok',
        maxOutputTokens: 200,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
        providerOptions: options,
      });
    },
  };
}
