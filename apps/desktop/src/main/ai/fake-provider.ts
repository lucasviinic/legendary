import { buildFallbackQuiz } from '@legendary/core';
import type { LLMProvider } from './types';

/** Tempo entre a tradução e o fim da resposta, como acontece com o streaming de verdade. */
const REST_OF_ANSWER_MS = 300;

/** Provedor determinístico para os testes ponta a ponta. Só é usado fora do app empacotado. */
export const fakeProvider: LLMProvider = {
  name: 'gemini',
  enrichWords: async (batch, onTranslation) => {
    const translationOf = (lemma: string) => `tradução de ${lemma}`;
    batch.forEach((word) => onTranslation?.(word, translationOf(word.lemma)));
    await new Promise((resolve) => setTimeout(resolve, REST_OF_ANSWER_MS));
    return batch.map(({ lemma, pos }) => ({
      lemma,
      pos,
      translation: translationOf(lemma),
      explanation: `Explicação curta de ${lemma}.`,
      exampleEn: `This is another example with ${lemma}.`,
      examplePt: `Este é outro exemplo com ${lemma}.`,
      cefr: 'B2' as const,
    }));
  },
  generateQuiz: async (words) => buildFallbackQuiz(words, 10, (items) => items),
  check: async () => undefined,
};
