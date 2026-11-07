// Gera resources/lexicon/frequency.json a partir de uma lista "palavra contagem", da mais comum
// para a menos comum. Uso: node scripts/build-lexicon.mjs caminho/en_50k.txt
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_WORDS = 30_000;
const LINE = /^([a-z][a-z'-]*) \d+$/;

const input = process.argv[2];
if (!input) throw new Error('Informe o caminho da lista de frequência.');

const words = readFileSync(input, 'utf8')
  .split('\n')
  .map((line) => LINE.exec(line)?.[1])
  .filter(Boolean)
  .slice(0, MAX_WORDS);

const output = join(import.meta.dirname, '../resources/lexicon/frequency.json');
writeFileSync(output, `${JSON.stringify(words)}\n`);
console.log(`${words.length} palavras em ${output}`);
