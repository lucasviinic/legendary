import type { PhraseKind, Token } from './tokenize';

export interface Phrase {
  text: string;
  kind: PhraseKind;
}

const MAX_GAP = 2;
/** Palavras que podem separar um phrasal verb: "figure the problem out". */
const GAP_POS = new Set(['PRON', 'DET', 'NOUN', 'PROPN', 'ADJ']);

interface Candidate {
  rest: string[];
  kind: PhraseKind;
  text: string;
}

function indexPhrases(phrases: readonly Phrase[]): Map<string, Candidate[]> {
  const index = new Map<string, Candidate[]>();
  for (const { text, kind } of phrases) {
    const [first, ...rest] = text.toLowerCase().split(' ');
    if (!first || rest.length === 0) continue;
    const entries = index.get(first) ?? [];
    entries.push({ rest, kind, text });
    index.set(first, entries);
  }
  return index;
}

/** Devolve o índice do último token da expressão que começa em `start`, ou -1. */
function matchEnd(tokens: readonly Token[], start: number, rest: readonly string[]): number {
  const [next, ...others] = rest;
  for (let gap = 0; gap <= MAX_GAP; gap++) {
    const position = start + 1 + gap;
    const token = tokens[position];
    if (!token) return -1;
    if (token.lemma === next) {
      const contiguous = others.every((word, i) => tokens[position + 1 + i]?.lemma === word);
      if (contiguous) return position + others.length;
    }
    if (!GAP_POS.has(token.pos)) return -1;
  }
  return -1;
}

/** Junta phrasal verbs e expressões em um único token. */
export function detectPhrases(tokens: readonly Token[], phrases: readonly Phrase[]): Token[] {
  const index = indexPhrases(phrases);
  const result: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    let joined = false;
    for (const candidate of index.get(token.lemma) ?? []) {
      const end = matchEnd(tokens, i, candidate.rest);
      if (end === -1) continue;
      result.push({
        surface: tokens
          .slice(i, end + 1)
          .map((part) => part.surface)
          .join(' '),
        lemma: candidate.text,
        pos: 'PHRASE',
        kind: candidate.kind,
      });
      i = end;
      joined = true;
      break;
    }
    if (!joined) result.push(token);
  }
  return result;
}
