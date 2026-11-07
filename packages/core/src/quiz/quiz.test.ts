import { describe, expect, it } from 'vitest';
import type { QuizQuestionDraft } from '@legendary/contracts';
import { buildFallbackQuiz, gradeAnswer, levenshtein, sanitizeDrafts, selectWords } from './index';

const draft = (overrides: Partial<QuizQuestionDraft>): QuizQuestionDraft => ({
  word: 'reckon',
  type: 'mc_en_pt',
  prompt: 'O que significa?',
  options: ['achar', 'correr', 'dormir', 'comer'],
  answer: 'achar',
  explanation: 'Dar uma opinião.',
  pairs: null,
  ...overrides,
});

describe('levenshtein', () => {
  it.each([
    ['reckon', 'reckon', 0],
    ['reckon', 'rekon', 1],
    ['reckon', 'reckons', 1],
    ['reckon', 'beckon', 1],
    ['reckon', 'wrecking', 3],
    ['', 'abc', 3],
  ])('%s to %s is %i', (a, b, distance) => {
    expect(levenshtein(a, b)).toBe(distance);
  });
});

describe('gradeAnswer', () => {
  it('accepts the right option', () => {
    expect(gradeAnswer(draft({}), 'achar').correct).toBe(true);
  });

  it('rejects a wrong option', () => {
    expect(gradeAnswer(draft({}), 'correr').correct).toBe(false);
  });

  it('does not accept a typo on a multiple choice answer', () => {
    expect(gradeAnswer(draft({}), 'achr').correct).toBe(false);
  });

  it('accepts true and false regardless of case', () => {
    const question = draft({ type: 'true_false', options: null, answer: 'true' });
    expect(gradeAnswer(question, 'TRUE').correct).toBe(true);
    expect(gradeAnswer(question, 'false').correct).toBe(false);
  });

  describe('typed answers', () => {
    const typed = draft({ type: 'type_word', options: null, answer: 'stumble upon' });

    it('ignores case and surrounding spaces', () => {
      expect(gradeAnswer(typed, '  Stumble Upon ').correct).toBe(true);
    });

    it('accepts one letter wrong', () => {
      expect(gradeAnswer(typed, 'stumble upin').correct).toBe(true);
    });

    it('rejects two letters wrong', () => {
      expect(gradeAnswer(typed, 'stumble into').correct).toBe(false);
    });

    it('rejects an empty answer even for a one letter word', () => {
      expect(gradeAnswer({ ...typed, answer: 'a' }, '').correct).toBe(false);
    });
  });

  it('treats a cloze without options as typed', () => {
    const question = draft({ type: 'cloze', options: null, answer: 'reckon' });
    expect(gradeAnswer(question, 'rekon').correct).toBe(true);
  });

  it('treats a cloze with options as a choice', () => {
    const question = draft({ type: 'cloze', options: ['reckon', 'rekon'], answer: 'reckon' });
    expect(gradeAnswer(question, 'rekon').correct).toBe(false);
  });

  describe('match', () => {
    const pairs = [
      { word: 'head out', meaning: 'sair' },
      { word: 'grumpy', meaning: 'mal-humorado' },
    ];
    const match = draft({ type: 'match', options: null, answer: '', pairs });

    it('is correct when every pair is right', () => {
      const answer = JSON.stringify({ 'head out': 'sair', grumpy: 'mal-humorado' });
      const result = gradeAnswer(match, answer);
      expect(result.correct).toBe(true);
      expect(result.matchResults?.every((pair) => pair.correct)).toBe(true);
    });

    it('reports which pair is wrong', () => {
      const answer = JSON.stringify({ 'head out': 'mal-humorado', grumpy: 'mal-humorado' });
      const result = gradeAnswer(match, answer);
      expect(result.correct).toBe(false);
      expect(result.matchResults).toEqual([
        { word: 'head out', meaning: 'sair', correct: false },
        { word: 'grumpy', meaning: 'mal-humorado', correct: true },
      ]);
    });

    it('is wrong when the answer is not valid JSON', () => {
      expect(gradeAnswer(match, 'not json').correct).toBe(false);
    });
  });
});

describe('selectWords', () => {
  const word = (senseId: number, count: number, wrongBefore = 0) => ({
    senseId,
    count,
    wrongBefore,
  });

  it('prefers the most frequent words', () => {
    const result = selectWords([word(1, 1), word(2, 5)], [], 1);
    expect(result).toEqual([2]);
  });

  it('prefers words the person got wrong before', () => {
    const result = selectWords([word(1, 3), word(2, 1, 2)], [], 1);
    expect(result).toEqual([2]);
  });

  it('keeps the earlier word when scores tie', () => {
    expect(selectWords([word(7, 2), word(8, 2)], [], 1)).toEqual([7]);
  });

  it('stops at the limit', () => {
    const words = Array.from({ length: 15 }, (_, i) => word(i, 1));
    expect(selectWords(words, [], 10)).toHaveLength(10);
  });

  it('completes with words due for review', () => {
    expect(selectWords([word(1, 1)], [9, 8], 3)).toEqual([1, 9, 8]);
  });

  it('does not repeat a word that is also due', () => {
    expect(selectWords([word(1, 1)], [1, 2], 3)).toEqual([1, 2]);
  });
});

describe('sanitizeDrafts', () => {
  const noShuffle = <T>(items: T[]) => items;

  it('keeps a valid question', () => {
    expect(sanitizeDrafts([draft({})], 10, noShuffle)).toHaveLength(1);
  });

  it('drops a choice question whose answer is not among the options', () => {
    expect(sanitizeDrafts([draft({ answer: 'nada' })], 10, noShuffle)).toEqual([]);
  });

  it('drops a match question with fewer than two pairs', () => {
    const question = draft({ type: 'match', pairs: [{ word: 'a', meaning: 'b' }] });
    expect(sanitizeDrafts([question], 10, noShuffle)).toEqual([]);
  });

  it('drops a typed question without an answer', () => {
    const question = draft({ type: 'type_word', options: null, answer: ' ' });
    expect(sanitizeDrafts([question], 10, noShuffle)).toEqual([]);
  });

  it('drops a true or false question with another answer', () => {
    const question = draft({ type: 'true_false', options: null, answer: 'maybe' });
    expect(sanitizeDrafts([question], 10, noShuffle)).toEqual([]);
  });

  it('caps the number of questions', () => {
    expect(sanitizeDrafts([draft({}), draft({}), draft({})], 2, noShuffle)).toHaveLength(2);
  });

  it('shuffles the options', () => {
    const reverse = <T>(items: T[]) => [...items].reverse();
    const [question] = sanitizeDrafts([draft({})], 10, reverse);
    expect(question?.options).toEqual(['comer', 'dormir', 'correr', 'achar']);
  });
});

describe('buildFallbackQuiz', () => {
  const words = ['reckon', 'grumpy', 'wary', 'hunch', 'knack', 'fed up'].map((word) => ({
    word,
    translation: `tradução de ${word}`,
    explanation: `explicação de ${word}`,
    sentence: `They said ${word} yesterday.`,
    surface: word,
  }));
  const keepOrder = <T>(items: T[]) => items;

  it('produces valid questions for every word', () => {
    const quiz = buildFallbackQuiz(words, 10, keepOrder);
    expect(sanitizeDrafts(quiz, 10, keepOrder)).toHaveLength(quiz.length);
    expect(new Set(quiz.map((question) => question.word)).size).toBe(words.length);
  });

  it('uses more than one question type', () => {
    const types = new Set(buildFallbackQuiz(words, 10, keepOrder).map((question) => question.type));
    expect(types.size).toBeGreaterThan(1);
  });

  it('blanks the word in a cloze question', () => {
    const cloze = buildFallbackQuiz(words, 10, keepOrder).find(
      (question) => question.type === 'cloze',
    );
    expect(cloze?.prompt).toContain('____');
    expect(cloze?.prompt).not.toContain(cloze?.answer);
  });

  it('respects the limit', () => {
    expect(buildFallbackQuiz(words, 3, keepOrder)).toHaveLength(3);
  });

  it('works with a single word', () => {
    const quiz = buildFallbackQuiz(words.slice(0, 1), 10, keepOrder);
    expect(sanitizeDrafts(quiz, 10, keepOrder)).toHaveLength(1);
  });

  it('skips cloze when the word is not in the sentence', () => {
    const quiz = buildFallbackQuiz(
      [{ ...words[0]!, sentence: 'Nothing here.' }, ...words.slice(1)],
      10,
      keepOrder,
    );
    expect(quiz.find((question) => question.word === 'reckon')?.type).not.toBe('cloze');
  });
});
