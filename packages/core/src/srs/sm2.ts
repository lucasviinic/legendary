import type { QuestionType } from '@legendary/contracts';

export const DAY_MS = 86_400_000;

export interface ReviewState {
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: number;
}

const INITIAL_EASE = 2.5;
const MIN_EASE = 1.3;
const PASSING_QUALITY = 3;
const FAILED_QUALITY = 1;
const FIRST_INTERVAL_DAYS = 3;
const SECOND_INTERVAL_DAYS = 6;
export const MASTERED_REPETITIONS = 3;

function nextEase(ease: number, quality: number): number {
  const miss = 5 - quality;
  return Math.max(MIN_EASE, ease + 0.1 - miss * (0.08 + miss * 0.02));
}

export function answerQuality(
  question: { type: QuestionType; options: readonly string[] | null },
  correct: boolean,
): number {
  if (!correct) return FAILED_QUALITY;
  if (question.type === 'type_word' || (question.type === 'cloze' && !question.options)) return 5;
  if (question.type === 'true_false') return 3;
  return 4;
}

export function nextReview(
  previous: ReviewState | null,
  quality: number,
  now: number,
): ReviewState {
  const ease = nextEase(previous?.ease ?? INITIAL_EASE, quality);

  if (quality < PASSING_QUALITY)
    return { ease, intervalDays: 1, repetitions: 0, dueAt: now + DAY_MS };

  const repetitions = (previous?.repetitions ?? 0) + 1;
  let intervalDays = FIRST_INTERVAL_DAYS;
  if (repetitions === 2) intervalDays = SECOND_INTERVAL_DAYS;
  else if (repetitions > 2) intervalDays = Math.round((previous?.intervalDays ?? 1) * ease);

  return { ease, intervalDays, repetitions, dueAt: now + intervalDays * DAY_MS };
}

export const isMastered = (state: Pick<ReviewState, 'repetitions' | 'dueAt'>, now: number) =>
  state.repetitions >= MASTERED_REPETITIONS && state.dueAt > now;

export const isDue = (state: Pick<ReviewState, 'dueAt'>, now: number) => state.dueAt <= now;
