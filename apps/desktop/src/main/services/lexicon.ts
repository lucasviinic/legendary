import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Lexicon, Phrase, PhraseKind } from '@legendary/core/pipeline';

/** Carrega a lista de frequência e as expressões, que ficam em `resources/lexicon`. */
export function loadLexicon(resourcesDir: string): Lexicon {
  const dir = join(resourcesDir, 'lexicon');
  const words = JSON.parse(readFileSync(join(dir, 'frequency.json'), 'utf8')) as string[];
  const groups = JSON.parse(readFileSync(join(dir, 'phrases.json'), 'utf8')) as Record<
    PhraseKind,
    string[]
  >;

  const phrases: Phrase[] = (Object.entries(groups) as [PhraseKind, string[]][]).flatMap(
    ([kind, texts]) => texts.map((text) => ({ text, kind })),
  );
  return { ranks: new Map(words.map((word, index) => [word, index + 1])), phrases };
}
