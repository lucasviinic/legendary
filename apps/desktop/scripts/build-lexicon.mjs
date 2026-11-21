import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tokenize } from '../../../packages/core/src/pipeline/tokenize.ts';

const MAX_LEMMAS = 30_000;
const LINE = /^([a-z][a-z'-]*) (\d+)$/;
const LEMMA = /^[a-z][a-z'-]*$/;

const input = process.argv[2];
if (!input) throw new Error('Informe o caminho da lista de frequência.');

function lemmaOf(word) {
  const tokens = tokenize(word);
  const lemma = tokens.length === 1 ? tokens[0].lemma : word;
  return LEMMA.test(lemma) ? lemma : word;
}

const counts = new Map();
for (const line of readFileSync(input, 'utf8').split('\n')) {
  const match = LINE.exec(line.trim());
  if (!match) continue;
  const [, word, count] = match;
  const lemma = lemmaOf(word);
  counts.set(lemma, (counts.get(lemma) ?? 0) + Number(count));
}

const lemmas = [...counts]
  .sort((a, b) => b[1] - a[1])
  .slice(0, MAX_LEMMAS)
  .map(([lemma]) => lemma);

const output = join(import.meta.dirname, '../resources/lexicon/frequency.json');
writeFileSync(output, `${JSON.stringify(lemmas)}\n`);
console.log(`${lemmas.length} lemas em ${output}`);
