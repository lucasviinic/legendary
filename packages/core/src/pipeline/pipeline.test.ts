import { describe, expect, it } from 'vitest';
import {
  createPipeline,
  detectPhrases,
  estimateCefr,
  filterTokens,
  normalize,
  scoreWord,
  tokenize,
  type Lexicon,
  type Token,
} from './index';

const lexicon: Lexicon = {
  ranks: new Map([
    ['the', 1],
    ['good', 90],
    ['think', 100],
    ['leave', 200],
    ['house', 400],
    ['dark', 800],
    ['reckon', 4000],
    ['grumpy', 9000],
    ['wary', 11000],
    ['hunch', 12000],
    ['very', 5000],
  ]),
  phrases: [
    { text: 'head out', kind: 'phrasal verb' },
    { text: 'figure out', kind: 'phrasal verb' },
    { text: 'stumble upon', kind: 'phrasal verb' },
    { text: 'fed up', kind: 'expression' },
  ],
};

const t = (surface: string, lemma: string, pos: string): Token => ({ surface, lemma, pos });

describe('normalize', () => {
  it.each([
    ['removes tags', '<i>I reckon</i> so', 'I reckon so'],
    ['removes bracketed sound notes', '[music] I reckon so', 'I reckon so'],
    ['removes parenthesised sound notes', '(door slams) I reckon so', 'I reckon so'],
    ['removes music symbols with their lyrics', '♪ la la la ♪', ''],
    ['removes a speaker name', 'JOHN: I reckon so', 'I reckon so'],
    ['removes a speaker name after a dialogue dash', '- JOHN: I reckon so', 'I reckon so'],
    ['removes the dialogue dash', '- I reckon so', 'I reckon so'],
    ['collapses line breaks', 'I reckon\nwe should', 'I reckon we should'],
    ['keeps a colon that is not a speaker', 'Note: this stays', 'Note: this stays'],
  ])('%s', (_name, input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe('tokenize', () => {
  it('turns each word into lemma, part of speech and surface', () => {
    const tokens = tokenize('She reckons houses are dark.');
    expect(tokens.find((token) => token.surface === 'reckons')).toMatchObject({
      lemma: 'reckon',
      pos: 'VERB',
    });
    expect(tokens.find((token) => token.surface === 'houses')).toMatchObject({
      lemma: 'house',
      pos: 'NOUN',
    });
  });

  it('marks punctuation so it can be filtered', () => {
    expect(tokenize('Hi.').at(-1)).toMatchObject({ pos: 'PUNCT' });
  });
});

describe('detectPhrases', () => {
  it('joins a phrasal verb into one token', () => {
    const tokens = [t('we', 'we', 'PRON'), t('headed', 'head', 'VERB'), t('out', 'out', 'ADP')];
    expect(detectPhrases(tokens, lexicon.phrases)).toEqual([
      t('we', 'we', 'PRON'),
      { surface: 'headed out', lemma: 'head out', pos: 'PHRASE', kind: 'phrasal verb' },
    ]);
  });

  it('joins a separated phrasal verb', () => {
    const tokens = [t('figure', 'figure', 'VERB'), t('it', 'it', 'PRON'), t('out', 'out', 'ADP')];
    expect(detectPhrases(tokens, lexicon.phrases)[0]).toMatchObject({
      lemma: 'figure out',
      surface: 'figure it out',
    });
  });

  it('does not join across more than two words', () => {
    const tokens = ['head', 'over', 'there', 'and', 'out'].map((word) => t(word, word, 'X'));
    expect(detectPhrases(tokens, lexicon.phrases)).toEqual(tokens);
  });

  it('leaves unrelated tokens untouched', () => {
    const tokens = [t('dark', 'dark', 'ADJ')];
    expect(detectPhrases(tokens, lexicon.phrases)).toEqual(tokens);
  });
});

describe('filterTokens', () => {
  const options = { level: 'B2', known: new Set<string>(), ranks: lexicon.ranks } as const;
  const lemmas = (tokens: Token[]) => filterTokens(tokens, options).map((token) => token.lemma);

  it('keeps a rare word', () => {
    expect(lemmas([t('reckons', 'reckon', 'VERB')])).toEqual(['reckon']);
  });

  it('removes stopwords', () => {
    expect(lemmas([t('the', 'the', 'DET'), t('very', 'very', 'ADV')])).toEqual([]);
  });

  it('removes proper names', () => {
    expect(lemmas([t('John', 'john', 'PROPN')])).toEqual([]);
  });

  it('removes a capitalised word in the middle of the sentence', () => {
    expect(lemmas([t('see', 'see', 'VERB'), t('Grumpy', 'grumpy', 'NOUN')])).toEqual([]);
  });

  it('keeps a capitalised word at the start of the sentence', () => {
    expect(lemmas([t('Grumpy', 'grumpy', 'ADJ')])).toEqual(['grumpy']);
  });

  it('removes numbers', () => {
    expect(lemmas([t('42', '42', 'NUM')])).toEqual([]);
  });

  it('removes a word below the frequency cut of the level', () => {
    expect(lemmas([t('dark', 'dark', 'ADJ')])).toEqual([]);
  });

  it('cuts more words at a higher level', () => {
    const token = t('reckons', 'reckon', 'VERB');
    expect(filterTokens([token], { ...options, level: 'B1' })).toHaveLength(1);
    expect(filterTokens([token], { ...options, level: 'C1' })).toHaveLength(0);
  });

  it('removes a word missing from the frequency list', () => {
    expect(lemmas([t('aaargh', 'aaargh', 'NOUN')])).toEqual([]);
  });

  it('removes a known word', () => {
    const known = new Set(['reckon']);
    expect(filterTokens([t('reckon', 'reckon', 'VERB')], { ...options, known })).toEqual([]);
  });

  it('keeps a phrase regardless of frequency', () => {
    const phrase: Token = {
      surface: 'head out',
      lemma: 'head out',
      pos: 'PHRASE',
      kind: 'phrasal verb',
    };
    expect(lemmas([phrase])).toEqual(['head out']);
  });

  it('removes a known phrase', () => {
    const phrase: Token = {
      surface: 'head out',
      lemma: 'head out',
      pos: 'PHRASE',
      kind: 'phrasal verb',
    };
    expect(filterTokens([phrase], { ...options, known: new Set(['head out']) })).toEqual([]);
  });
});

describe('scoreWord', () => {
  it('rewards words seen more often in the session', () => {
    expect(scoreWord({ count: 3, rank: 5000 })).toBeGreaterThan(
      scoreWord({ count: 1, rank: 5000 }),
    );
  });

  it('rewards rarer words', () => {
    expect(scoreWord({ count: 1, rank: 12000 })).toBeGreaterThan(
      scoreWord({ count: 1, rank: 4000 }),
    );
  });

  it('treats a word without a rank as rare', () => {
    expect(scoreWord({ count: 1, rank: undefined })).toBeGreaterThan(
      scoreWord({ count: 1, rank: 4000 }),
    );
  });
});

describe('estimateCefr', () => {
  it.each([
    [1000, 'B1'],
    [4000, 'B2'],
    [12000, 'C1'],
    [undefined, 'B2'],
  ])('rank %s is %s', (rank, level) => {
    expect(estimateCefr(rank)).toBe(level);
  });
});

describe('createPipeline', () => {
  const pipeline = createPipeline(lexicon);
  const run = (text: string, known: string[] = [], counts: [string, number][] = []) =>
    pipeline(text, { level: 'B2', known: new Set(known), sessionCounts: new Map(counts) });

  it('returns the new words of a caption with their context', () => {
    const [word] = run('JOHN: I reckon the house is dark.');
    expect(word).toMatchObject({
      lemma: 'reckon',
      pos: 'verb',
      surface: 'reckon',
      sentence: 'I reckon the house is dark.',
      count: 1,
    });
  });

  it('labels a phrasal verb and keeps its surface for the underline', () => {
    const [word] = run('We headed out.');
    expect(word).toMatchObject({ lemma: 'head out', pos: 'phrasal verb', surface: 'headed out' });
  });

  it('orders words by score, highest first', () => {
    const words = run('I reckon he is wary.');
    expect(words.map((word) => word.lemma)).toEqual(['wary', 'reckon']);
  });

  it('counts earlier appearances in the session', () => {
    const [word] = run('I reckon so.', [], [['reckon|verb', 2]]);
    expect(word?.count).toBe(3);
  });

  it('counts a word once when it repeats inside a caption', () => {
    const words = run('I reckon, I reckon.');
    expect(words).toHaveLength(1);
    expect(words[0]?.count).toBe(1);
  });

  it('returns nothing for a sound note', () => {
    expect(run('[music]')).toEqual([]);
  });

  it('skips known words', () => {
    expect(run('I reckon so.', ['reckon'])).toEqual([]);
  });
});
