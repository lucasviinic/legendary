import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DAY_MS } from '@legendary/core';
import { createHarness } from '../test/harness';

type Harness = ReturnType<typeof createHarness>;
let h: Harness;
let sessionId: number;
let sense: Record<string, number>;

const request = {
  scope: { kind: 'all' },
  filter: 'all',
  search: '',
  limit: 100,
  offset: 0,
} as const;

function addWord(lemma: string, cefr: string, count: number, session = sessionId) {
  const { id } = h.repos.senses.insert({
    lemma,
    pos: 'verb',
    translation: `t-${lemma}`,
    explanation: 'e',
    exampleEn: 'x',
    examplePt: 'y',
    cefr,
    provider: 'gemini',
  });
  h.repos.sessionWords.upsert({
    sessionId: session,
    senseId: id,
    count,
    contextSentence: 's',
    firstSeenAt: h.clock.now,
  });
  return id;
}

function answerQuestion(senseId: number, correct: boolean, session = sessionId) {
  const quiz = h.repos.quizzes.create(session, h.clock.now);
  const question = h.repos.quizzes.addQuestion({
    quizId: quiz.id,
    senseId,
    type: 'mc_en_pt',
    payloadJson: '{}',
  });
  h.repos.quizzes.recordAnswer(question.id, 'x', correct);
}

beforeEach(() => {
  h = createHarness();
  sessionId = h.repos.sessions.create({
    title: 'Northbound',
    source: 'netflix',
    startedAt: h.clock.now,
  }).id;
  h.repos.sessions.end(sessionId, h.clock.now + 42 * 60_000);
  sense = {
    reckon: addWord('reckon', 'B2', 3),
    wary: addWord('wary', 'C1', 1),
    grumpy: addWord('grumpy', 'B1', 2),
  };
});
afterEach(() => h.close());

const lemmas = (result: { rows: { lemma: string }[] }) =>
  result.rows.map((row) => row.lemma).sort();

describe('history list', () => {
  it('lists sessions, newest first, with duration and word count', () => {
    h.repos.sessions.create({ title: 'Older', source: 'youtube', startedAt: h.clock.now - DAY_MS });
    const { sessions } = h.history.list();
    expect(sessions.map((session) => session.title)).toEqual(['Northbound', 'Older']);
    expect(sessions[0]).toMatchObject({ durationMs: 42 * 60_000, wordCount: 3, quiz: null });
  });

  it('shows the score of the last finished quiz', () => {
    const quiz = h.repos.quizzes.create(sessionId, h.clock.now);
    const question = h.repos.quizzes.addQuestion({
      quizId: quiz.id,
      senseId: sense.reckon!,
      type: 'x',
      payloadJson: '{}',
    });
    h.repos.quizzes.recordAnswer(question.id, 'x', true);
    h.repos.quizzes.finish(quiz.id, 1, h.clock.now);
    expect(h.history.list().sessions[0]?.quiz).toEqual({ score: 1, total: 1 });
  });

  it('counts all, saved and due words', () => {
    h.repos.saved.toggle(sense.reckon!, h.clock.now);
    h.repos.reviews.upsert(sense.wary!, {
      ease: 2.5,
      intervalDays: 1,
      repetitions: 0,
      dueAt: h.clock.now - 1,
    });
    expect(h.history.list().counts).toEqual({ all: 3, saved: 1, dueToday: 1 });
  });
});

describe('history words', () => {
  it('returns the columns of the table', () => {
    answerQuestion(sense.reckon!, true);
    answerQuestion(sense.reckon!, false);
    h.repos.saved.toggle(sense.reckon!, h.clock.now);
    h.repos.reviews.upsert(sense.reckon!, {
      ease: 2.5,
      intervalDays: 3,
      repetitions: 1,
      dueAt: 123,
    });
    const row = h.history.words(request).rows.find((item) => item.lemma === 'reckon');
    expect(row).toEqual({
      senseId: sense.reckon,
      lemma: 'reckon',
      translation: 't-reckon',
      seen: 3,
      correct: 1,
      answered: 2,
      cefr: 'B2',
      dueAt: 123,
      saved: true,
    });
  });

  it('adds up appearances across sessions', () => {
    const other = h.repos.sessions.create({
      title: 'Other',
      source: 'netflix',
      startedAt: h.clock.now,
    }).id;
    h.repos.sessionWords.upsert({
      sessionId: other,
      senseId: sense.reckon!,
      count: 4,
      contextSentence: 's',
      firstSeenAt: 1,
    });
    expect(h.history.words(request).rows.find((row) => row.lemma === 'reckon')?.seen).toBe(7);
  });

  it('limits to one session', () => {
    const other = h.repos.sessions.create({
      title: 'Other',
      source: 'netflix',
      startedAt: h.clock.now,
    }).id;
    addWord('hunch', 'B2', 1, other);
    h.repos.sessionWords.upsert({
      sessionId: other,
      senseId: sense.reckon!,
      count: 4,
      contextSentence: 's',
      firstSeenAt: 1,
    });
    const result = h.history.words({ ...request, scope: { kind: 'session', sessionId: other } });
    expect(lemmas(result)).toEqual(['hunch', 'reckon']);
    expect(result.rows.find((row) => row.lemma === 'reckon')?.seen).toBe(4);
  });

  it('filters by saved', () => {
    h.repos.saved.toggle(sense.wary!, h.clock.now);
    expect(lemmas(h.history.words({ ...request, filter: 'saved' }))).toEqual(['wary']);
    expect(lemmas(h.history.words({ ...request, scope: { kind: 'saved' } }))).toEqual(['wary']);
  });

  it('filters by words answered wrong', () => {
    answerQuestion(sense.grumpy!, false);
    answerQuestion(sense.reckon!, true);
    expect(lemmas(h.history.words({ ...request, filter: 'wrong' }))).toEqual(['grumpy']);
  });

  it('filters by level', () => {
    expect(lemmas(h.history.words({ ...request, filter: 'C1' }))).toEqual(['wary']);
  });

  it('searches word and translation', () => {
    expect(lemmas(h.history.words({ ...request, search: 'wAr' }))).toEqual(['wary']);
    expect(lemmas(h.history.words({ ...request, search: 't-gru' }))).toEqual(['grumpy']);
  });

  it('treats search wildcards as plain text', () => {
    expect(h.history.words({ ...request, search: '%' }).rows).toEqual([]);
  });

  it('limits to words due today', () => {
    h.repos.reviews.upsert(sense.wary!, {
      ease: 2.5,
      intervalDays: 1,
      repetitions: 0,
      dueAt: h.clock.now - 1,
    });
    h.repos.reviews.upsert(sense.reckon!, {
      ease: 2.5,
      intervalDays: 3,
      repetitions: 1,
      dueAt: h.clock.now + 3 * DAY_MS,
    });
    expect(lemmas(h.history.words({ ...request, scope: { kind: 'due' } }))).toEqual(['wary']);
  });

  it('paginates and reports the total', () => {
    const result = h.history.words({ ...request, limit: 2, offset: 0 });
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(h.history.words({ ...request, limit: 2, offset: 2 }).rows).toHaveLength(1);
  });
});
