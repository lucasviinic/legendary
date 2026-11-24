import { normalize } from '../pipeline/normalize';

const MAX_SUGGESTIONS = 5;
const WORD_CHAR = /[\p{L}\p{N}']/u;
const WORD_START = /(?<![\p{L}\p{N}'])[\p{L}\p{N}]/gu;

const straighten = (text: string) => text.replace(/[‘’]/g, "'");

export function suggestWords(query: string, captions: readonly string[]): string[] {
  const typed = straighten(query.toLowerCase().replace(/\s+/g, ' ').trimStart());
  if (!/\p{L}/u.test(typed)) return [];

  const suggestions = new Set<string>();
  for (const caption of [...captions].reverse()) {
    const text = straighten(normalize(caption).toLowerCase());
    for (const { index } of text.matchAll(WORD_START)) {
      if (!text.startsWith(typed, index)) continue;
      let end = index + typed.length;
      while (end < text.length && WORD_CHAR.test(text.charAt(end))) end += 1;
      const word = text.slice(index, end).trimEnd();
      if (word !== typed.trimEnd()) suggestions.add(word);
      if (suggestions.size === MAX_SUGGESTIONS) return [...suggestions];
    }
  }
  return [...suggestions];
}
