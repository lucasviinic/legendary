import type { QuizAnswerResult, QuizResult, QuizSummary, QuizView } from '@legendary/contracts';
import { create } from 'zustand';
import { api } from '../shared/api';

type Phase = 'loading' | 'summary' | 'question' | 'final' | 'error';

interface QuizState {
  phase: Phase;
  sessionId: number;
  summary: QuizSummary | null;
  excluded: Set<number>;
  preparing: boolean;
  quiz: QuizView | null;
  index: number;
  picked: string | null;
  result: QuizAnswerResult | null;
  final: QuizResult | null;
  load(sessionId: number): Promise<void>;
  toggleWord(senseId: number): void;
  start(): Promise<void>;
  answer(value: string): Promise<void>;
  next(): Promise<void>;
  reviewMistakes(): Promise<void>;
}

export const useQuiz = create<QuizState>((set, get) => ({
  phase: 'loading',
  sessionId: 0,
  summary: null,
  excluded: new Set(),
  preparing: false,
  quiz: null,
  index: 0,
  picked: null,
  result: null,
  final: null,

  async load(sessionId) {
    try {
      const summary = await api().invoke('quiz:summary', { sessionId });
      const excluded = new Set(
        summary.words.filter((word) => !word.selected).map((word) => word.senseId),
      );
      set({ phase: 'summary', sessionId, summary, excluded });
    } catch {
      set({ phase: 'error' });
    }
  },

  toggleWord(senseId) {
    const excluded = new Set(get().excluded);
    if (!excluded.delete(senseId)) excluded.add(senseId);
    set({ excluded });
  },

  async start() {
    const { summary, excluded, sessionId, preparing } = get();
    if (!summary || preparing) return;
    const senseIds = summary.words.map((word) => word.senseId).filter((id) => !excluded.has(id));
    if (senseIds.length === 0) return;
    set({ preparing: true });
    try {
      const quiz = await api().invoke('quiz:get', { sessionId, senseIds });
      set({ quiz, index: 0, picked: null, result: null, phase: 'question', preparing: false });
    } catch {
      set({ phase: 'error', preparing: false });
    }
  },

  async answer(value) {
    const { quiz, index, result } = get();
    const question = quiz?.questions[index];
    if (!question || result) return;
    set({ picked: value });
    const answered = await api().invoke('quiz:answer', { questionId: question.id, answer: value });
    set({ result: answered });
  },

  async next() {
    const { quiz, index, result } = get();
    if (!quiz || !result) return;
    if (index + 1 < quiz.questions.length) {
      set({ index: index + 1, picked: null, result: null });
      return;
    }
    const final = await api().invoke('quiz:finish', { quizId: quiz.quizId });
    set({ final, phase: 'final' });
  },

  async reviewMistakes() {
    const { final } = get();
    if (!final) return;
    const quiz = await api().invoke('quiz:review-mistakes', { quizId: final.quizId });
    set({ quiz, index: 0, picked: null, result: null, final: null, phase: 'question' });
  },
}));
