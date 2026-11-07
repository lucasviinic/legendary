import type { Level } from '@legendary/contracts';
import type { Token } from './tokenize';

/** Posição mínima na lista de frequência para uma palavra interessar a cada nível. */
export const FREQUENCY_CUT: Record<Level, number> = { B1: 1500, B2: 3000, C1: 7000 };

const CONTENT_POS = new Set(['VERB', 'NOUN', 'ADJ', 'ADV']);
/** Ao traduzir tudo, também entram palavras como "despite". As mais básicas estão em STOPWORDS. */
const ALL_WORDS_POS = new Set([...CONTENT_POS, 'ADP', 'CCONJ', 'SCONJ']);

const STOPWORDS = new Set(
  (
    'a about above after again all also am an and any are as at be because been before being below ' +
    'between both but by can could did do does doing down during each few for from further had has ' +
    'have having he her here hers him his how if in into is it its just me more most my no nor not ' +
    'now of off on once only or other our out over own same she should so some such than that the ' +
    'their them then there these they this those through to too under until up very was we were ' +
    'what when where which while who whom why will with would yet you your'
  ).split(' '),
);

const WORD = /^[a-z][a-z'-]+$/;

export interface FilterOptions {
  level: Level;
  known: ReadonlySet<string>;
  ranks: ReadonlyMap<string, number>;
  /** Não corta pela frequência, então vale até para palavras fora da lista. */
  allWords?: boolean | undefined;
}

function startsSentence(tokens: readonly Token[], index: number): boolean {
  if (index === 0) return true;
  const previous = tokens[index - 1];
  return previous?.pos === 'PUNCT' && /[.!?…]/.test(previous.surface);
}

export function filterTokens(tokens: readonly Token[], options: FilterOptions): Token[] {
  const cut = FREQUENCY_CUT[options.level];

  return tokens.filter((token, index) => {
    if (options.known.has(token.lemma)) return false;
    if (token.pos === 'PHRASE') return true;
    if (!(options.allWords ? ALL_WORDS_POS : CONTENT_POS).has(token.pos)) return false;
    if (!WORD.test(token.lemma) || STOPWORDS.has(token.lemma)) return false;
    if (/^[A-Z]/.test(token.surface) && !startsSentence(tokens, index)) return false;
    if (options.allWords) return true;
    const rank = options.ranks.get(token.lemma);
    return rank !== undefined && rank >= cut;
  });
}
