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

/** As legendas só deixam passar as quatro primeiras classes. As demais vêm da busca. */
const POS_LABEL: Record<string, string> = {
  VERB: 'verb',
  NOUN: 'noun',
  ADJ: 'adj',
  ADV: 'adv',
  AUX: 'verb',
  PROPN: 'noun',
  ADP: 'prep',
  CCONJ: 'conj',
  SCONJ: 'conj',
  DET: 'det',
  PRON: 'pron',
  INTJ: 'interj',
  NUM: 'num',
};

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

export interface LookupContext {
  /** Legendas recentes, da mais antiga para a mais nova. */
  sentences: readonly string[];
  sessionCounts: ReadonlyMap<string, number>;
}

/** A mesma palavra pode ter outro lema na frase: sozinha, "leaves" parece o verbo "leave". */
const sameWord = (token: Token, typed: Token) =>
  token.lemma === typed.lemma || token.surface.toLowerCase() === typed.surface.toLowerCase();

/** Onde as palavras digitadas aparecem em sequência na frase. */
function findWords(tokens: readonly Token[], words: readonly Token[]): Token[] | undefined {
  for (let start = 0; start + words.length <= tokens.length; start++) {
    const found = tokens.slice(start, start + words.length);
    if (found.every((token, index) => sameWord(token, words[index]!))) return found;
  }
  return undefined;
}

/**
 * Monta o candidato de uma palavra digitada. Ela não passa pelos filtros, porque a pessoa pediu.
 * Se uma legenda recente tiver a palavra, vale o lema, a forma e a classe usados nela. A palavra
 * sozinha é só um palpite.
 */
export function createWordLookup(lexicon: Lexicon) {
  const read = (text: string) =>
    detectPhrases(tokenize(text), lexicon.phrases).filter((token) => token.pos !== 'PUNCT');

  return (query: string, context: LookupContext): WordCandidate | null => {
    const typed = normalize(query);
    if (!/\p{L}/u.test(typed)) return null;

    const words = read(typed);
    if (words.length === 0) return null;
    const expression = words.length > 1;
    const wanted: Token = expression
      ? {
          surface: typed,
          lemma: words.map((word) => word.lemma).join(' '),
          pos: 'PHRASE',
          kind: 'expression',
        }
      : words[0]!;

    let token = wanted;
    let sentence = '';
    for (const raw of [...context.sentences].reverse()) {
      const text = normalize(raw);
      const found = findWords(read(text), words);
      if (found) {
        token = expression
          ? { ...wanted, surface: found.map((item) => item.surface).join(' ') }
          : found[0]!;
        sentence = text;
        break;
      }
    }

    const pos = posLabel(token);
    const count = Math.max(1, context.sessionCounts.get(wordKey(token.lemma, pos)) ?? 0);
    const rank = lexicon.ranks.get(token.lemma);
    return {
      lemma: token.lemma,
      pos,
      surface: token.surface,
      sentence,
      count,
      score: scoreWord({ count, rank }),
      estimatedCefr: estimateCefr(rank),
    };
  };
}
