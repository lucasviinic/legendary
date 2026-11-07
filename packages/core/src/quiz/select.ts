export interface SelectableWord {
  senseId: number;
  count: number;
  wrongBefore: number;
}

const WRONG_WEIGHT = 2;

/** Escolhe as palavras do quiz: as mais frequentes e as erradas antes, completando com revisões. */
export function selectWords(
  sessionWords: readonly SelectableWord[],
  dueSenseIds: readonly number[],
  limit: number,
): number[] {
  const score = (word: SelectableWord) => word.count + WRONG_WEIGHT * word.wrongBefore;
  const ranked = [...sessionWords].sort((a, b) => score(b) - score(a)).map((word) => word.senseId);
  return [...new Set([...ranked, ...dueSenseIds])].slice(0, limit);
}
