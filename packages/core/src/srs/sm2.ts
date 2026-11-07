export const DAY_MS = 86_400_000;

export interface ReviewState {
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: number;
}

const INITIAL_EASE = 2.5;
const MIN_EASE = 1.3;
const QUALITY_CORRECT = 4;
const QUALITY_WRONG = 1;
/** O SM-2 clássico usa 1 dia aqui. O mockup mostra "Em 3 dias" depois do primeiro acerto. */
const FIRST_INTERVAL_DAYS = 3;
const SECOND_INTERVAL_DAYS = 6;

function nextEase(ease: number, quality: number): number {
  const miss = 5 - quality;
  return Math.max(MIN_EASE, ease + 0.1 - miss * (0.08 + miss * 0.02));
}

/** Atualiza a revisão espaçada de uma palavra depois de uma resposta. */
export function nextReview(
  previous: ReviewState | null,
  correct: boolean,
  now: number,
): ReviewState {
  const ease = nextEase(previous?.ease ?? INITIAL_EASE, correct ? QUALITY_CORRECT : QUALITY_WRONG);

  if (!correct) return { ease, intervalDays: 1, repetitions: 0, dueAt: now + DAY_MS };

  const repetitions = (previous?.repetitions ?? 0) + 1;
  let intervalDays = FIRST_INTERVAL_DAYS;
  if (repetitions === 2) intervalDays = SECOND_INTERVAL_DAYS;
  else if (repetitions > 2) intervalDays = Math.round((previous?.intervalDays ?? 1) * ease);

  return { ease, intervalDays, repetitions, dueAt: now + intervalDays * DAY_MS };
}
