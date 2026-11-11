import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizQuestionDraft } from '@legendary/contracts';
import { DAY_MS } from '@legendary/core';
import { quizQuestions } from '@legendary/db';
import { eq } from 'drizzle-orm';
import { createHarness, fakeProvider } from '../test/harness';

type Harness = ReturnType<typeof createHarness>;
let h: Harness;

const WORDS = ['reckon', 'grumpy', 'wary', 'hunch'] as const;

function seedSession(harness: Harness, words: readonly string[] = WORDS): number {
  const sessionId = harness.repos.sessions.create({
    title: 'Northbound · T1E3',
    source: 'netflix',
    startedAt: harness.clock.now,
  }).id;
  words.forEach((lemma, i) => {
    const sense = harness.repos.senses.insert({
      lemma,
      pos: 'adj',
      translation: `t-${lemma}`,
      explanation: `e-${lemma}`,
      exampleEn: `Example ${lemma}.`,
      examplePt: `Exemplo ${lemma}.`,
      cefr: 'B2',
      provider: 'gemini',
    });
    harness.repos.sessionWords.upsert({
      sessionId,
      senseId: sense.id,
      count: words.length - i,
      contextSentence: `They said ${lemma} today.`,
      firstSeenAt: harness.clock.now + 12_000,
    });
  });
  return sessionId;
}

const senseIds = (harness: Harness, sessionId: number) =>
  harness.repos.sessionWords.listForSession(sessionId).map((word) => word.senseId);

const aiDraft = (overrides: Partial<QuizQuestionDraft>): QuizQuestionDraft => ({
  word: 'reckon',
  type: 'mc_en_pt',
  prompt: 'O que significa reckon?',
  options: ['t-reckon', 'b', 'c', 'd'],
  answer: 't-reckon',
  explanation: 'Porque sim.',
  pairs: null,
  ...overrides,
});

beforeEach(() => {
  h = createHarness();
});
afterEach(() => h.close());

describe('summary', () => {
  it('describes the session', () => {
    const sessionId = seedSession(h);
    h.repos.sessions.end(sessionId, h.clock.now + 60_000);
    expect(h.quiz.summary(sessionId)).toMatchObject({
      title: 'Northbound · T1E3',
      durationMs: 60_000,
      newWords: 4,
      savedWords: 0,
    });
  });

  it('shows at most 12 words and selects at most 10, like the mockup', () => {
    const words = Array.from({ length: 15 }, (_, i) => `word${i}`);
    const sessionId = seedSession(h, words);
    const { words: listed } = h.quiz.summary(sessionId);
    expect(listed).toHaveLength(12);
    expect(listed.filter((word) => word.selected)).toHaveLength(10);
  });

  it('selects as many words as the questions set in the settings', () => {
    h.settings.update({ quizQuestions: 5 });
    const words = Array.from({ length: 15 }, (_, i) => `word${i}`);
    const summary = h.quiz.summary(seedSession(h, words));
    expect(summary.maxQuestions).toBe(5);
    expect(summary.words).toHaveLength(12);
    expect(summary.words.filter((word) => word.selected)).toHaveLength(5);
  });

  it('shows every word a longer quiz needs', () => {
    h.settings.update({ quizQuestions: 20 });
    const words = Array.from({ length: 25 }, (_, i) => `word${i}`);
    const { words: listed } = h.quiz.summary(seedSession(h, words));
    expect(listed).toHaveLength(20);
    expect(listed.filter((word) => word.selected)).toHaveLength(20);
  });

  it('lists the most frequent words first', () => {
    const sessionId = seedSession(h);
    expect(h.quiz.summary(sessionId).words[0]?.word).toBe('reckon');
  });

  it('leaves out words marked as known', () => {
    const sessionId = seedSession(h);
    h.repos.known.add('reckon', h.clock.now);
    expect(h.quiz.summary(sessionId).words.map((word) => word.word)).not.toContain('reckon');
  });

  it('completes a short session with words due for review', () => {
    const old = seedSession(h, ['knack']);
    const senseId = senseIds(h, old)[0]!;
    h.repos.reviews.upsert(senseId, {
      ease: 2.5,
      intervalDays: 1,
      repetitions: 0,
      dueAt: h.clock.now - DAY_MS,
    });
    const sessionId = seedSession(h, ['wary']);
    expect(h.quiz.summary(sessionId).words.map((word) => word.word)).toEqual(['wary', 'knack']);
  });

  it('counts saved words', () => {
    const sessionId = seedSession(h);
    h.repos.saved.toggle(senseIds(h, sessionId)[0]!, h.clock.now);
    expect(h.quiz.summary(sessionId).savedWords).toBe(1);
  });

  it('does not count words marked as known as new', () => {
    const sessionId = seedSession(h);
    h.repos.known.add('reckon', h.clock.now);
    expect(h.quiz.summary(sessionId).newWords).toBe(3);
  });
});

describe('words to sort at the end of the session', () => {
  let sessionId: number;
  beforeEach(() => {
    sessionId = h.repos.sessions.create({
      title: 'Northbound · T1E3',
      source: 'netflix',
      startedAt: h.clock.now,
    }).id;
  });

  /** Grava uma palavra da sessão vista pela primeira vez `seconds` depois do começo. */
  const seen = (lemma: string, seconds: number, pos = 'adj') => {
    const sense = h.repos.senses.insert({
      lemma,
      pos,
      translation: `t-${lemma}`,
      explanation: `e-${lemma}`,
      exampleEn: `Example ${lemma}.`,
      examplePt: `Exemplo ${lemma}.`,
      cefr: 'B2',
      provider: 'gemini',
    });
    h.repos.sessionWords.upsert({
      sessionId,
      senseId: sense.id,
      count: 1,
      contextSentence: `They said ${lemma} today.`,
      firstSeenAt: h.clock.now + seconds * 1000,
    });
    return sense.id;
  };
  const sorted = () => h.quiz.triage(sessionId).map(({ word }) => word);

  it('lists the words in the order they first appeared', () => {
    seen('grumpy', 30);
    seen('reckon', 10);
    seen('wary', 20);
    expect(sorted()).toEqual(['reckon', 'wary', 'grumpy']);
  });

  it('shows the translation and the sentence where the word appeared', () => {
    const senseId = seen('reckon', 10, 'verb');
    expect(h.quiz.triage(sessionId)).toEqual([
      {
        senseId,
        word: 'reckon',
        pos: 'verb',
        cefr: 'B2',
        translation: 't-reckon',
        sentence: 'They said reckon today.',
      },
    ]);
  });

  it('leaves out words already marked as known', () => {
    seen('reckon', 10);
    seen('wary', 20);
    h.repos.known.add('reckon', h.clock.now);
    expect(sorted()).toEqual(['wary']);
  });

  it('leaves out words saved during the video', () => {
    seen('reckon', 10);
    h.repos.saved.toggle(seen('wary', 20), h.clock.now);
    expect(sorted()).toEqual(['reckon']);
  });

  it('shows a word once even when it appeared with two classes', () => {
    seen('hunch', 10, 'noun');
    seen('hunch', 20, 'verb');
    expect(h.quiz.triage(sessionId)).toMatchObject([{ word: 'hunch', pos: 'noun' }]);
  });

  it('leaves out the whole word when one of its classes was saved', () => {
    seen('hunch', 10, 'noun');
    h.repos.saved.toggle(seen('hunch', 20, 'verb'), h.clock.now);
    expect(sorted()).toEqual([]);
  });

  it('leaves out words due for review from other sessions', () => {
    const old = seedSession(h, ['knack']);
    h.repos.reviews.upsert(senseIds(h, old)[0]!, {
      ease: 2.5,
      intervalDays: 1,
      repetitions: 0,
      dueAt: h.clock.now - DAY_MS,
    });
    seen('wary', 10);
    expect(sorted()).toEqual(['wary']);
  });
});

describe('creating a quiz', () => {
  it('uses the questions generated by the AI', async () => {
    h.close();
    h = createHarness({
      provider: fakeProvider({ generateQuiz: vi.fn(async () => [aiDraft({})]) }),
    });
    const sessionId = seedSession(h);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    expect(quiz.questions).toHaveLength(1);
    expect(quiz.questions[0]).toMatchObject({ prompt: 'O que significa reckon?' });
  });

  it('never sends the answer to the renderer', async () => {
    const sessionId = seedSession(h);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    expect(JSON.stringify(quiz.questions)).not.toContain('"answer"');
  });

  it('builds a quiz without AI when the call fails', async () => {
    const sessionId = seedSession(h);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    expect(quiz.questions).toHaveLength(4);
  });

  it('builds a quiz without AI when there is no key', async () => {
    h.close();
    h = createHarness({ provider: null });
    const sessionId = seedSession(h);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    expect(quiz.questions).toHaveLength(4);
  });

  it('builds a quiz without AI when every generated question is unusable', async () => {
    h.close();
    h = createHarness({
      provider: fakeProvider({ generateQuiz: vi.fn(async () => [aiDraft({ answer: 'nada' })]) }),
    });
    const sessionId = seedSession(h);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    expect(quiz.questions.length).toBeGreaterThan(1);
  });

  it('drops a question about a word that was not requested', async () => {
    h.close();
    h = createHarness({
      provider: fakeProvider({
        generateQuiz: vi.fn(async () => [aiDraft({}), aiDraft({ word: 'invented' })]),
      }),
    });
    const sessionId = seedSession(h);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    expect(quiz.questions).toHaveLength(1);
  });

  it('caps the quiz at 10 questions', async () => {
    const words = Array.from({ length: 15 }, (_, i) => `word${i}`);
    const sessionId = seedSession(h, words);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    expect(quiz.questions).toHaveLength(10);
  });

  it('caps the quiz without AI at the questions set in the settings', async () => {
    h.settings.update({ quizQuestions: 15 });
    const words = Array.from({ length: 20 }, (_, i) => `word${i}`);
    const sessionId = seedSession(h, words);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    expect(quiz.questions).toHaveLength(15);
  });

  it('asks the AI for the questions set in the settings, and keeps no more than that', async () => {
    const words = [...WORDS, 'knack', 'bail', 'fed'];
    const generateQuiz = vi.fn(async () =>
      words.map((word) => aiDraft({ word, options: [`t-${word}`, 'b'], answer: `t-${word}` })),
    );
    h.close();
    h = createHarness({ provider: fakeProvider({ generateQuiz }), settings: { quizQuestions: 5 } });
    const sessionId = seedSession(h, words);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    expect(generateQuiz).toHaveBeenCalledWith(expect.any(Array), 5);
    expect(quiz.questions).toHaveLength(5);
  });

  it('adds where the sentence came from to a cloze question', async () => {
    const sessionId = seedSession(h);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    const cloze = quiz.questions.find((question) => question.type === 'cloze');
    expect(cloze?.context).toBe('Northbound · T1E3 · 00:12');
  });

  it('splits a match question into two columns', async () => {
    const pairs = [
      { word: 'reckon', meaning: 't-reckon' },
      { word: 'wary', meaning: 't-wary' },
    ];
    h.close();
    h = createHarness({
      provider: fakeProvider({
        generateQuiz: vi.fn(async () => [
          aiDraft({ type: 'match', prompt: 'Associe', options: null, answer: '', pairs }),
        ]),
      }),
    });
    const sessionId = seedSession(h);
    const [question] = (await h.quiz.create(sessionId, senseIds(h, sessionId))).questions;
    expect(question?.matchWords).toEqual(['reckon', 'wary']);
    expect(question?.options).toEqual(['t-reckon', 't-wary']);
  });
});

describe('answering', () => {
  async function singleQuestion(draft: Partial<QuizQuestionDraft>) {
    h.close();
    h = createHarness({
      provider: fakeProvider({ generateQuiz: vi.fn(async () => [aiDraft(draft)]) }),
    });
    const sessionId = seedSession(h);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    return { quiz, question: quiz.questions[0]! };
  }

  it('grades locally and returns the explanation', async () => {
    const { question } = await singleQuestion({});
    expect(h.quiz.answer(question.id, 't-reckon')).toMatchObject({
      correct: true,
      correctAnswer: 't-reckon',
      word: 'reckon',
      translation: 't-reckon',
      explanation: 'Porque sim.',
    });
  });

  it('tells when the answer is wrong', async () => {
    const { question } = await singleQuestion({});
    expect(h.quiz.answer(question.id, 'b').correct).toBe(false);
  });

  it('accepts one wrong letter when typing', async () => {
    const { question } = await singleQuestion({
      type: 'type_word',
      options: null,
      answer: 'reckon',
    });
    expect(h.quiz.answer(question.id, 'Rekon').correct).toBe(true);
  });

  it('keeps the first answer when answering twice', async () => {
    const { question } = await singleQuestion({});
    h.quiz.answer(question.id, 'b');
    expect(h.quiz.answer(question.id, 't-reckon').correct).toBe(false);
  });

  it('rejects a corrupted stored question', async () => {
    const { question } = await singleQuestion({});
    h.db
      .update(quizQuestions)
      .set({ payloadJson: '{"broken":true}' })
      .where(eq(quizQuestions.id, question.id))
      .run();
    expect(() => h.quiz.answer(question.id, 'b')).toThrow();
  });

  it('fails clearly for an unknown question', () => {
    expect(() => h.quiz.answer(999, 'b')).toThrow();
  });
});

describe('finishing', () => {
  async function play(answers: (id: number, index: number) => string) {
    const sessionId = seedSession(h);
    const quiz = await h.quiz.create(sessionId, senseIds(h, sessionId));
    quiz.questions.forEach((question, index) =>
      h.quiz.answer(question.id, answers(question.id, index)),
    );
    return { sessionId, quiz };
  }

  const reviewFor = (lemma: string) => {
    const sense = h.repos.senses.findByLemmaPos(lemma, 'adj')!;
    return h.repos.reviews.get(sense.id);
  };

  it('gives the score and lists the mistakes', async () => {
    const { quiz } = await play(() => 'errado');
    const result = h.quiz.finish(quiz.quizId);
    expect(result).toMatchObject({ score: 0, total: 4 });
    expect(result.mistakes).toHaveLength(4);
    expect(result.mistakes[0]).toMatchObject({ userAnswer: 'errado', word: 'reckon' });
  });

  it('schedules a wrong word for tomorrow', async () => {
    const { quiz } = await play(() => 'errado');
    h.quiz.finish(quiz.quizId);
    expect(reviewFor('reckon')?.dueAt).toBe(h.clock.now + DAY_MS);
  });

  it('schedules a right word in 3 days', async () => {
    h.close();
    h = createHarness({
      provider: fakeProvider({ generateQuiz: vi.fn(async () => [aiDraft({})]) }),
    });
    const { quiz } = await play(() => 't-reckon');
    expect(h.quiz.finish(quiz.quizId).score).toBe(1);
    expect(reviewFor('reckon')?.dueAt).toBe(h.clock.now + 3 * DAY_MS);
  });

  it('counts a match question per word when scheduling', async () => {
    const pairs = [
      { word: 'reckon', meaning: 't-reckon' },
      { word: 'wary', meaning: 't-wary' },
    ];
    h.close();
    h = createHarness({
      provider: fakeProvider({
        generateQuiz: vi.fn(async () => [
          aiDraft({ type: 'match', prompt: 'Associe', options: null, answer: '', pairs }),
        ]),
      }),
    });
    const answer = JSON.stringify({ reckon: 't-reckon', wary: 't-reckon' });
    const { quiz } = await play(() => answer);
    h.quiz.finish(quiz.quizId);
    expect(reviewFor('reckon')?.dueAt).toBe(h.clock.now + 3 * DAY_MS);
    expect(reviewFor('wary')?.dueAt).toBe(h.clock.now + DAY_MS);
  });

  it('stores the score on the quiz', async () => {
    const { quiz } = await play(() => 'errado');
    h.quiz.finish(quiz.quizId);
    expect(h.repos.quizzes.byId(quiz.quizId)).toMatchObject({ score: 0, finishedAt: h.clock.now });
  });

  it('does not apply reviews twice when finishing twice', async () => {
    const { quiz } = await play(() => 'errado');
    h.quiz.finish(quiz.quizId);
    const before = reviewFor('reckon');
    h.clock.now += DAY_MS;
    h.quiz.finish(quiz.quizId);
    expect(reviewFor('reckon')).toEqual(before);
  });

  it('builds a new quiz from the mistakes', async () => {
    h.close();
    h = createHarness({ provider: null });
    const { quiz } = await play((_id, index) => (index === 0 ? 'errado' : 'errado'));
    h.quiz.finish(quiz.quizId);
    const again = await h.quiz.reviewMistakes(quiz.quizId);
    expect(again.quizId).not.toBe(quiz.quizId);
    expect(again.questions).toHaveLength(4);
  });
});
