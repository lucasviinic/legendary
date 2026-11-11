import type {
  QuizAnswerResult,
  QuizResult,
  QuizSummary,
  QuizView,
  TriageWord,
} from '@legendary/contracts';
import { create } from 'zustand';
import { api } from '../shared/api';

type Phase = 'loading' | 'triage' | 'summary' | 'empty' | 'question' | 'final' | 'error';

interface QuizState {
  phase: Phase;
  sessionId: number;
  triage: TriageWord[];
  triageIndex: number;
  /** As palavras marcadas na triagem, pelo sentido, para a volta saber o que desfazer. */
  triageKnown: Set<number>;
  summary: QuizSummary | null;
  excluded: Set<number>;
  preparing: boolean;
  quiz: QuizView | null;
  index: number;
  picked: string | null;
  result: QuizAnswerResult | null;
  final: QuizResult | null;
  load(sessionId: number, triage?: boolean): Promise<void>;
  knowWord(): void;
  skipWord(): void;
  backWord(): void;
  finishTriage(): Promise<void>;
  toggleWord(senseId: number): void;
  start(): Promise<void>;
  answer(value: string): Promise<void>;
  next(): Promise<void>;
  reviewMistakes(): Promise<void>;
}

/**
 * A triagem anda na hora, e cada marcação vai para o main em seguida, na ordem em que foi feita.
 * O resumo só é lido depois que todas chegaram, para já sair sem as palavras marcadas.
 */
let writes: Promise<unknown> = Promise.resolve();
const write = (channel: 'vocab:mark-known' | 'vocab:unmark-known', lemma: string) => {
  writes = writes.then(() => api().invoke(channel, { lemma })).catch(() => undefined);
};

/** Fechar a janela antes disso perderia as marcações que ainda estão na fila. */
export const marksSaved = () => writes;

export const useQuiz = create<QuizState>((set, get) => {
  async function summarize(sessionId: number) {
    const summary = await api().invoke('quiz:summary', { sessionId });
    if (summary.words.length === 0) {
      set({ phase: 'empty', sessionId, summary });
      return;
    }
    const excluded = new Set(
      summary.words.filter((word) => !word.selected).map((word) => word.senseId),
    );
    set({ phase: 'summary', sessionId, summary, excluded });
  }

  function advance() {
    const { triage, triageIndex } = get();
    if (triageIndex + 1 < triage.length) set({ triageIndex: triageIndex + 1 });
    else void get().finishTriage();
  }

  /** A palavra que está na tela, ou nada fora da triagem. */
  function current() {
    const { phase, triage, triageIndex } = get();
    return phase === 'triage' ? triage[triageIndex] : undefined;
  }

  return {
    phase: 'loading',
    sessionId: 0,
    triage: [],
    triageIndex: 0,
    triageKnown: new Set(),
    summary: null,
    excluded: new Set(),
    preparing: false,
    quiz: null,
    index: 0,
    picked: null,
    result: null,
    final: null,

    async load(sessionId, triage = false) {
      try {
        if (triage) {
          const words = await api().invoke('quiz:triage', { sessionId });
          if (words.length > 0) {
            set({
              phase: 'triage',
              sessionId,
              triage: words,
              triageIndex: 0,
              triageKnown: new Set(),
            });
            return;
          }
        }
        await summarize(sessionId);
      } catch {
        set({ phase: 'error' });
      }
    },

    knowWord() {
      const word = current();
      if (!word) return;
      write('vocab:mark-known', word.word);
      set({ triageKnown: new Set(get().triageKnown).add(word.senseId) });
      advance();
    },

    skipWord() {
      if (current()) advance();
    },

    backWord() {
      const { triage, triageIndex, triageKnown } = get();
      const previous = triage[triageIndex - 1];
      if (!current() || !previous) return;
      const known = new Set(triageKnown);
      if (known.delete(previous.senseId)) write('vocab:unmark-known', previous.word);
      set({ triageIndex: triageIndex - 1, triageKnown: known });
    },

    async finishTriage() {
      const { phase, sessionId } = get();
      if (phase !== 'triage') return;
      set({ phase: 'loading' });
      try {
        await writes;
        await summarize(sessionId);
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
      const answered = await api().invoke('quiz:answer', {
        questionId: question.id,
        answer: value,
      });
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
  };
});
