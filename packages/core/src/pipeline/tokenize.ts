import model from 'wink-eng-lite-web-model';
import winkNLP from 'wink-nlp';

export type PhraseKind = 'phrasal verb' | 'expression';

export interface Token {
  surface: string;
  lemma: string;
  pos: string;
  /** Só nos tokens de expressão, para virar o rótulo do card. */
  kind?: PhraseKind;
}

const nlp = winkNLP(model);
const { its } = nlp;
// Os tipos do wink-nlp não aceitam `its.lemma` em `out()`, embora funcione: é o uso documentado.
const lemmaIts = its.lemma as unknown as typeof its.value;

export function tokenize(text: string): Token[] {
  const tokens = nlp.readDoc(text).tokens();
  const surfaces = tokens.out(its.value) as string[];
  const lemmas = tokens.out(lemmaIts) as string[];
  const parts = tokens.out(its.pos) as string[];
  return surfaces.map((surface, i) => ({
    surface,
    lemma: (lemmas[i] ?? surface).toLowerCase(),
    pos: parts[i] ?? 'X',
  }));
}
