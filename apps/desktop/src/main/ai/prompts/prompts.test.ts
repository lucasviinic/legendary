import { describe, expect, it } from 'vitest';
import { buildEnrichPrompt } from './enrich';
import { buildMatchPrompt } from './match';
import { buildQuizPrompt } from './quiz';

describe('prompts', () => {
  it('enrich prompt', () => {
    expect(
      buildEnrichPrompt(
        [
          { lemma: 'reckon', pos: 'verb', surface: 'reckon', sentence: 'I reckon we should go.' },
          {
            lemma: 'head out',
            pos: 'phrasal verb',
            surface: 'headed out',
            sentence: 'We headed out.',
          },
        ],
        'B2',
      ),
    ).toMatchSnapshot();
  });

  it('gives the AI the word as it appeared and the sentence', () => {
    const { prompt } = buildEnrichPrompt(
      [{ lemma: 'leaf', pos: 'noun', surface: 'leaves', sentence: 'The leaves fell down.' }],
      'B2',
    );
    expect(prompt).toContain('"surface": "leaves"');
    expect(prompt).toContain('"sentence": "The leaves fell down."');
  });

  it('quiz prompt', () => {
    expect(
      buildQuizPrompt(
        [
          {
            word: 'reckon',
            translation: 'achar, supor',
            explanation: 'Jeito informal de dar uma opinião.',
            sentence: 'I reckon we should go.',
            surface: 'reckon',
          },
        ],
        10,
      ),
    ).toMatchSnapshot();
  });

  it('asks the AI for exactly the questions the quiz needs', () => {
    const word = {
      word: 'reckon',
      translation: 'achar',
      explanation: '',
      sentence: '',
      surface: '',
    };
    expect(buildQuizPrompt([word], 15).system).toContain('exatamente 15 questões');
  });

  it('writes the explanations for the level of the person', () => {
    const word = { lemma: 'reckon', pos: 'verb', surface: 'reckon', sentence: '' };
    expect(buildEnrichPrompt([word], 'C1').system).toContain('nível C1');
  });

  it('asks whether the word has other common senses', () => {
    const word = { lemma: 'bank', pos: 'noun', surface: 'bank', sentence: '' };
    expect(buildEnrichPrompt([word], 'B2').system).toContain('polysemous');
  });

  it('match prompt', () => {
    expect(
      buildMatchPrompt(
        { lemma: 'bank', pos: 'noun', surface: 'bank', sentence: 'They sat on the river bank.' },
        [
          { translation: 'banco', explanation: 'Instituição financeira.' },
          { translation: 'margem', explanation: 'A beira de um rio.' },
        ],
      ),
    ).toMatchSnapshot();
  });
});
