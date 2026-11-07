import type { QuizQuestionDraft } from '@legendary/contracts';
import type { Shuffle } from './sanitize';

export interface FallbackWord {
  word: string;
  translation: string;
  explanation: string;
  sentence: string;
  surface: string;
}

const MAX_DISTRACTORS = 3;
const BLANK = '____';

const others = <T>(items: readonly T[], index: number, pick: (item: T) => string) =>
  items
    .filter((_, i) => i !== index)
    .map(pick)
    .slice(0, MAX_DISTRACTORS);

function typeWord(word: FallbackWord): QuizQuestionDraft {
  return {
    word: word.word,
    type: 'type_word',
    prompt: `Escreva em inglês: “${word.translation}”`,
    options: null,
    answer: word.word,
    explanation: word.explanation,
    pairs: null,
  };
}

function cloze(
  words: readonly FallbackWord[],
  index: number,
  shuffle: Shuffle,
): QuizQuestionDraft | null {
  const word = words[index]!;
  const escaped = word.surface.replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`);
  const pattern = new RegExp(`\\b${escaped}\\b`);
  if (!pattern.test(word.sentence)) return null;
  return {
    word: word.word,
    type: 'cloze',
    prompt: `“${word.sentence.replace(pattern, BLANK)}”`,
    options: shuffle([word.surface, ...others(words, index, (item) => item.surface)]),
    answer: word.surface,
    explanation: word.explanation,
    pairs: null,
  };
}

function choice(
  words: readonly FallbackWord[],
  index: number,
  shuffle: Shuffle,
  type: 'mc_en_pt' | 'mc_pt_en',
): QuizQuestionDraft {
  const word = words[index]!;
  const enToPt = type === 'mc_en_pt';
  const answer = enToPt ? word.translation : word.word;
  return {
    word: word.word,
    type,
    prompt: enToPt
      ? `O que significa “${word.word}”?`
      : `Como se diz “${word.translation}” em inglês?`,
    options: shuffle([
      answer,
      ...others(words, index, (item) => (enToPt ? item.translation : item.word)),
    ]),
    answer,
    explanation: word.explanation,
    pairs: null,
  };
}

/** Quiz montado sem IA, para quando a chave falta ou a chamada falha. */
export function buildFallbackQuiz(
  words: readonly FallbackWord[],
  limit: number,
  shuffle: Shuffle,
): QuizQuestionDraft[] {
  return words.slice(0, limit).map((word, index) => {
    if (words.length === 1) return typeWord(word);
    switch (index % 4) {
      case 0:
        return cloze(words, index, shuffle) ?? choice(words, index, shuffle, 'mc_en_pt');
      case 1:
        return choice(words, index, shuffle, 'mc_en_pt');
      case 2:
        return choice(words, index, shuffle, 'mc_pt_en');
      default:
        return typeWord(word);
    }
  });
}
