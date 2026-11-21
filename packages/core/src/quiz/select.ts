export interface SelectableWord {
  senseId: number;
  count: number;
  wrongBefore: number;
}

export interface SelectionSize {
  questions: number;
  limit: number;
}

const WRONG_WEIGHT = 2;
const REVIEW_SHARE = 0.3;

export function selectWords(
  sessionWords: readonly SelectableWord[],
  dueSenseIds: readonly number[],
  { questions, limit }: SelectionSize,
): number[] {
  const score = (word: SelectableWord) => word.count + WRONG_WEIGHT * word.wrongBefore;
  const ranked = [...sessionWords].sort((a, b) => score(b) - score(a)).map((word) => word.senseId);
  const fresh = new Set(ranked);
  const reviews = [...new Set(dueSenseIds)].filter((id) => !fresh.has(id));

  const reviewSlots = Math.min(reviews.length, Math.ceil(questions * REVIEW_SHARE));
  const freshSlots = questions - reviewSlots;
  return [
    ...ranked.slice(0, freshSlots),
    ...reviews.slice(0, reviewSlots),
    ...ranked.slice(freshSlots),
    ...reviews.slice(reviewSlots),
  ].slice(0, limit);
}
