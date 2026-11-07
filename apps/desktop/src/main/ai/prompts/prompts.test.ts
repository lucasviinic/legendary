import { describe, expect, it } from 'vitest';
import { buildEnrichPrompt } from './enrich';
import { buildQuizPrompt } from './quiz';

describe('prompts', () => {
  it('enrich prompt', () => {
    expect(
      buildEnrichPrompt([
        { lemma: 'reckon', pos: 'verb', surface: 'reckon', sentence: 'I reckon we should go.' },
        {
          lemma: 'head out',
          pos: 'phrasal verb',
          surface: 'headed out',
          sentence: 'We headed out.',
        },
      ]),
    ).toMatchSnapshot();
  });

  it('gives the AI the word as it appeared and the sentence', () => {
    const { prompt } = buildEnrichPrompt([
      { lemma: 'leaf', pos: 'noun', surface: 'leaves', sentence: 'The leaves fell down.' },
    ]);
    expect(prompt).toContain('"surface": "leaves"');
    expect(prompt).toContain('"sentence": "The leaves fell down."');
  });

  it('quiz prompt', () => {
    expect(
      buildQuizPrompt([
        {
          word: 'reckon',
          translation: 'achar, supor',
          explanation: 'Jeito informal de dar uma opinião.',
          sentence: 'I reckon we should go.',
          surface: 'reckon',
        },
      ]),
    ).toMatchSnapshot();
  });
});
