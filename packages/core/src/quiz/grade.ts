import type { QuizQuestionDraft } from '@legendary/contracts';
import { levenshtein } from './levenshtein';

export interface MatchResult {
  word: string;
  meaning: string;
  correct: boolean;
}

export interface GradeResult {
  correct: boolean;
  matchResults: MatchResult[] | null;
}

const clean = (text: string) => text.trim().toLowerCase();

function parsePairs(answer: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(answer);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function gradeMatch(question: QuizQuestionDraft, answer: string): GradeResult {
  const chosen = parsePairs(answer);
  const matchResults = (question.pairs ?? []).map(({ word, meaning }) => ({
    word,
    meaning,
    correct: chosen[word] === meaning,
  }));
  return { correct: matchResults.every((pair) => pair.correct), matchResults };
}

const isTyped = (question: QuizQuestionDraft) =>
  question.type === 'type_word' || (question.type === 'cloze' && !question.options);

/** Corrige uma resposta localmente. Na digitação, aceita um erro de letra. */
export function gradeAnswer(question: QuizQuestionDraft, answer: string): GradeResult {
  if (question.type === 'match') return gradeMatch(question, answer);

  const given = clean(answer);
  const expected = clean(question.answer);
  const correct = isTyped(question)
    ? given.length > 0 && levenshtein(given, expected) <= 1
    : given === expected;
  return { correct, matchResults: null };
}
