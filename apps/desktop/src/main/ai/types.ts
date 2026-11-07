import type {
  EnrichRequestWord,
  EnrichedWord,
  Provider,
  QuizQuestionDraft,
} from '@legendary/contracts';
import type { FallbackWord } from '@legendary/core';

/** Avisa que a tradução de uma palavra ficou pronta, antes do resto da resposta. */
export type OnTranslation = (word: EnrichRequestWord, translation: string) => void;

/** O que o resto do app enxerga de um provedor de IA. */
export interface LLMProvider {
  readonly name: Provider;
  enrichWords(batch: EnrichRequestWord[], onTranslation?: OnTranslation): Promise<EnrichedWord[]>;
  generateQuiz(words: FallbackWord[]): Promise<QuizQuestionDraft[]>;
  /** Faz uma chamada mínima para confirmar que a chave funciona. */
  check(): Promise<void>;
}
