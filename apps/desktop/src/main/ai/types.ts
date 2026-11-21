import type {
  EnrichRequestWord,
  EnrichedWord,
  Level,
  Provider,
  QuizQuestionDraft,
  SenseOption,
} from '@legendary/contracts';
import type { FallbackWord } from '@legendary/core';

export type OnTranslation = (word: EnrichRequestWord, translation: string) => void;
export type OnQuestion = (question: QuizQuestionDraft) => void;

export interface EnrichOptions {
  level: Level;
  onTranslation?: OnTranslation | undefined;
}

export interface LLMProvider {
  readonly name: Provider;
  enrichWords(batch: EnrichRequestWord[], options: EnrichOptions): Promise<EnrichedWord[]>;
  matchSense(word: EnrichRequestWord, senses: readonly SenseOption[]): Promise<number | null>;
  generateQuiz(
    words: FallbackWord[],
    count: number,
    onQuestion?: OnQuestion,
  ): Promise<QuizQuestionDraft[]>;
  check(): Promise<void>;
}
