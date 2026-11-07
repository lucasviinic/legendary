import { buildFallbackQuiz } from '@legendary/core';
import type { LLMProvider } from './types';

/** Provedor determinístico para os testes ponta a ponta. Só é usado fora do app empacotado. */
export const fakeProvider: LLMProvider = {
  name: 'gemini',
  enrichWords: async (batch) =>
    batch.map(({ lemma, pos }) => ({
      lemma,
      pos,
      translation: `tradução de ${lemma}`,
      explanation: `Explicação curta de ${lemma}.`,
      exampleEn: `This is another example with ${lemma}.`,
      examplePt: `Este é outro exemplo com ${lemma}.`,
      cefr: 'B2' as const,
    })),
  generateQuiz: async (words) => buildFallbackQuiz(words, 10, (items) => items),
  check: async () => undefined,
};
