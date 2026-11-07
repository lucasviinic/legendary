import type { QuizQuestionDraft } from '@legendary/contracts';

export type Shuffle = <T>(items: T[]) => T[];

const clean = (text: string) => text.trim().toLowerCase();

function isValid(question: QuizQuestionDraft): boolean {
  switch (question.type) {
    case 'match':
      return (question.pairs?.length ?? 0) >= 2;
    case 'true_false':
      return ['true', 'false'].includes(clean(question.answer));
    case 'type_word':
      return clean(question.answer).length > 0;
    case 'cloze':
      if (!question.options) return clean(question.answer).length > 0;
      break;
    default:
      break;
  }
  const options = question.options ?? [];
  return options.length >= 2 && options.some((option) => clean(option) === clean(question.answer));
}

/** A resposta da IA já vem validada no formato, mas não no sentido: aqui ficam só as jogáveis. */
export function sanitizeDrafts(
  drafts: readonly QuizQuestionDraft[],
  limit: number,
  shuffle: Shuffle,
): QuizQuestionDraft[] {
  return drafts
    .filter(isValid)
    .slice(0, limit)
    .map((question) =>
      question.options ? { ...question, options: shuffle(question.options) } : question,
    );
}
