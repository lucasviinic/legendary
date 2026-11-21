import { buildFallbackQuiz } from '@legendary/core';
import type { QuizQuestionDraft } from '@legendary/contracts';
import type { LLMProvider } from './types';

const REST_OF_ANSWER_MS = 300;

export const fakeProvider: LLMProvider = {
  name: 'gemini',
  enrichWords: async (batch, { onTranslation }) => {
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
      polysemous: false,
    }));
  },
  matchSense: async () => 0,
  generateQuiz: async (words, count, onQuestion) => {
    const questions: QuizQuestionDraft[] = [
      ...(words.length >= 2
        ? [
            {
              word: words[0]!.word,
              type: 'match' as const,
              prompt: 'Associe cada expressão ao significado',
              options: null,
              answer: '',
              explanation: 'Cada expressão com a tradução dela.',
              pairs: words
                .slice(0, 3)
                .map(({ word, translation }) => ({ word, meaning: translation })),
            },
          ]
        : []),
      ...buildFallbackQuiz(words, count - 1, (items) => items),
    ];
    questions.forEach((question) => onQuestion?.(question));
    return questions;
  },
  check: async () => undefined,
};
