import { tokenize } from './tokenize';

const ENGLISH_SHARE = 0.5;

export function isMostlyEnglish(
  lines: readonly string[],
  ranks: ReadonlyMap<string, number>,
): boolean {
  const words = tokenize(lines.join('\n')).filter((token) => /\p{L}/u.test(token.surface));
  if (words.length === 0) return false;
  const known = words.filter(
    (token) => ranks.has(token.lemma) || ranks.has(token.surface.toLowerCase()),
  ).length;
  return known / words.length >= ENGLISH_SHARE;
}
