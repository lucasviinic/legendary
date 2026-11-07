import type {
  EnrichRequestWord,
  EnrichedWord,
  Provider,
  QuizQuestionDraft,
} from '@legendary/contracts';
import type { FallbackWord } from '@legendary/core';

/** O que o resto do app enxerga de um provedor de IA. */
export interface LLMProvider {
  readonly name: Provider;
  enrichWords(batch: EnrichRequestWord[]): Promise<EnrichedWord[]>;
  generateQuiz(words: FallbackWord[]): Promise<QuizQuestionDraft[]>;
  /** Faz uma chamada mínima para confirmar que a chave funciona. */
  check(): Promise<void>;
}
