import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizQuestionView, QuizResult, QuizSummary, QuizView } from '@legendary/contracts';
import { useQuiz } from './store';

const question = (id: number): QuizQuestionView => ({
  id,
  type: 'mc_en_pt',
  prompt: `Questão ${id}`,
  options: ['a', 'b'],
  matchWords: null,
  context: null,
});

const summary: QuizSummary = {
  sessionId: 1,
  title: 'Northbound',
  durationMs: 0,
  newWords: 3,
  savedWords: 0,
  maxQuestions: 10,
  words: [{ senseId: 1, word: 'reckon', translation: 'achar', selected: true }],
};

const final: QuizResult = { quizId: 7, sessionId: 1, score: 1, total: 1, mistakes: [] };

let reply: QuizView;
const invoke = vi.fn(async (channel: string) => {
  if (channel === 'quiz:summary') return summary;
  if (channel === 'quiz:get') return reply;
  if (channel === 'quiz:answer') return { correct: true };
  if (channel === 'quiz:finish') return final;
  return undefined;
});

const state = () => useQuiz.getState();

async function startQuiz(view: QuizView) {
  reply = view;
  await state().load(1);
  await state().start();
}

beforeEach(() => {
  invoke.mockClear();
  vi.stubGlobal('window', { legendary: { invoke, on: () => () => undefined } });
  useQuiz.setState({ quiz: null, index: 0, result: null, final: null, preparing: false });
});

describe('quiz arriving in parts', () => {
  it('adds the questions that arrive after the first one, once each', async () => {
    await startQuiz({ quizId: 1, questions: [question(1)], total: 3 });
    state().receiveQuestion(1, question(2));
    state().receiveQuestion(1, question(2));
    expect(state().quiz?.questions.map(({ id }) => id)).toEqual([1, 2]);
  });

  it('keeps questions that arrive before the quiz itself', async () => {
    state().receiveQuestion(2, question(5));
    state().completeQuiz(2, 2);
    await startQuiz({ quizId: 2, questions: [question(4)], total: 3 });
    expect(state().quiz).toMatchObject({ total: 2 });
    expect(state().quiz?.questions.map(({ id }) => id)).toEqual([4, 5]);
  });

  it('ignores the questions of another quiz', async () => {
    await startQuiz({ quizId: 3, questions: [question(1)], total: 2 });
    state().receiveQuestion(99, question(8));
    expect(state().quiz?.questions).toHaveLength(1);
  });

  it('moves on to a question that has not arrived yet, counting the planned total', async () => {
    await startQuiz({ quizId: 4, questions: [question(1)], total: 3 });
    await state().answer('a');
    await state().next();
    expect(state()).toMatchObject({ index: 1, phase: 'question' });
    expect(invoke).not.toHaveBeenCalledWith('quiz:finish', expect.anything());
  });

  it('finishes when the quiz ends shorter than planned while the person waits', async () => {
    await startQuiz({ quizId: 5, questions: [question(1)], total: 3 });
    await state().answer('a');
    await state().next();
    state().completeQuiz(5, 1);
    await vi.waitFor(() => expect(state().phase).toBe('final'));
  });
});
