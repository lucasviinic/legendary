import type { Cefr, Level } from '@legendary/contracts';
import { filterTokens } from './filter';
import { normalize } from './normalize';
import { detectPhrases, type Phrase } from './phrases';
import { estimateCefr, scoreWord } from './score';
import { tokenize, type Token } from './tokenize';

export { filterTokens, FREQUENCY_CUT } from './filter';
export { normalize } from './normalize';
export { detectPhrases, type Phrase } from './phrases';
export { estimateCefr, scoreWord } from './score';
export { tokenize, type PhraseKind, type Token } from './tokenize';

export interface Lexicon {
  ranks: ReadonlyMap<string, number>;
  phrases: readonly Phrase[];
}

export interface PipelineContext {
  level: Level;
  known: ReadonlySet<string>;
  /** Aparições anteriores na sessão, pela chave `lemma|pos`. */
  sessionCounts: ReadonlyMap<string, number>;
}

export interface WordCandidate {
  lemma: string;
  pos: string;
  surface: string;
  sentence: string;
  count: number;
  score: number;
  estimatedCefr: Cefr;
}

const POS_LABEL: Record<string, string> = { VERB: 'verb', NOUN: 'noun', ADJ: 'adj', ADV: 'adv' };

function posLabel(token: Token): string {
  return token.kind ?? POS_LABEL[token.pos] ?? token.pos.toLowerCase();
}

export const wordKey = (lemma: string, pos: string): string => `${lemma}|${pos}`;

/** Executa os passos do pipeline para uma frase e devolve as palavras novas por pontuação. */
export function createPipeline(lexicon: Lexicon) {
  return (rawText: string, context: PipelineContext): WordCandidate[] => {
    const sentence = normalize(rawText);
    if (!sentence) return [];

    const tokens = detectPhrases(tokenize(sentence), lexicon.phrases);
    const kept = filterTokens(tokens, {
      level: context.level,
      known: context.known,
      ranks: lexicon.ranks,
    });

    const byKey = new Map<string, WordCandidate>();
    for (const token of kept) {
      const pos = posLabel(token);
      const key = wordKey(token.lemma, pos);
      if (byKey.has(key)) continue;
      const count = (context.sessionCounts.get(key) ?? 0) + 1;
      const rank = lexicon.ranks.get(token.lemma);
      byKey.set(key, {
        lemma: token.lemma,
        pos,
        surface: token.surface,
        sentence,
        count,
        score: scoreWord({ count, rank }),
        estimatedCefr: estimateCefr(rank),
      });
    }
    return [...byKey.values()].sort((a, b) => b.score - a.score);
  };
}
