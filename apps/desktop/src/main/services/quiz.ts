import { z } from 'zod';
import {
  QuizQuestionDraftSchema,
  type QuizAnswerResult,
  type QuizMistake,
  type QuizQuestionDraft,
  type QuizQuestionView,
  type QuizResult,
  type QuizSummary,
  type QuizView,
} from '@legendary/contracts';
import {
  buildFallbackQuiz,
  formatElapsed,
  gradeAnswer,
  nextReview,
  sanitizeDrafts,
  selectWords,
  type FallbackWord,
  type Shuffle,
} from '@legendary/core';
import type { LLMProvider } from '../ai/types';
import type { Repositories } from '../db/repositories';
import type { QuizQuestionRow } from '../db/repositories/quizzes';
import type { WordSense } from '../db/repositories/senses';

const SUMMARY_WORDS = 12;
const QUIZ_QUESTIONS = 10;

/** O que fica em `payload_json`: a questão e os dados do app calculados na criação. */
const StoredQuestionSchema = QuizQuestionDraftSchema.extend({
  context: z.string().nullable(),
  /** Na questão de associar, o sentido de cada palavra da coluna da esquerda. */
  pairSenses: z.record(z.string(), z.number()).nullable(),
});
type StoredQuestion = z.infer<typeof StoredQuestionSchema>;

export interface QuizDeps {
  repos: Repositories;
  getProvider: () => LLMProvider | null;
  now: () => number;
  shuffle: Shuffle;
}

export class QuizService {
  constructor(private readonly deps: QuizDeps) {}

  summary(sessionId: number): QuizSummary {
    const { repos } = this.deps;
    const session = repos.sessions.byId(sessionId);
    if (!session) throw new Error(`Sessão ${sessionId} não encontrada.`);

    const known = repos.known.all();
    const wrong = repos.quizzes.wrongCounts();
    const sessionWords = repos.sessionWords.listForSession(sessionId);
    const senses = new Map(
      repos.senses
        .byIds(sessionWords.map((word) => word.senseId))
        .map((sense) => [sense.id, sense]),
    );
    const isNew = (sense: WordSense | undefined) => sense !== undefined && !known.has(sense.lemma);

    const selectable = sessionWords
      .filter((word) => isNew(senses.get(word.senseId)))
      .map((word) => ({
        senseId: word.senseId,
        count: word.count,
        wrongBefore: wrong.get(word.senseId) ?? 0,
      }));
    const due = repos.reviews.dueSenseIds(this.deps.now());
    repos.senses.byIds(due).forEach((sense) => senses.set(sense.id, sense));
    const dueNew = due.filter((id) => isNew(senses.get(id)));

    const words = selectWords(selectable, dueNew, SUMMARY_WORDS).map((senseId, index) => {
      const sense = senses.get(senseId)!;
      return {
        senseId,
        word: sense.lemma,
        translation: sense.translation,
        selected: index < QUIZ_QUESTIONS,
      };
    });

    return {
      sessionId,
      title: session.title,
      durationMs: session.endedAt === null ? 0 : session.endedAt - session.startedAt,
      newWords: sessionWords.length,
      savedWords: repos.saved.countForSession(sessionId),
      words,
    };
  }

  async create(sessionId: number, senseIds: number[]): Promise<QuizView> {
    const { repos, now } = this.deps;
    const session = repos.sessions.byId(sessionId);
    if (!session) throw new Error(`Sessão ${sessionId} não encontrada.`);

    const senses = repos.senses.byIds(senseIds);
    const order = new Map(senseIds.map((id, index) => [id, index]));
    senses.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const words = senses.map((sense) => this.toQuizWord(sense, sessionId));

    const bySense = new Map(senses.map((sense) => [sense.lemma.toLowerCase(), sense]));
    const drafts = await this.draftQuestions(words, bySense);
    const quiz = repos.quizzes.create(sessionId, now());

    const questions = drafts.map((draft) => {
      const sense = this.senseOf(draft, bySense)!;
      const stored: StoredQuestion = {
        ...draft,
        context: this.contextFor(draft, sense, session),
        pairSenses: draft.pairs
          ? Object.fromEntries(
              draft.pairs.map((pair) => [pair.word, bySense.get(pair.word.toLowerCase())!.id]),
            )
          : null,
      };
      const row = repos.quizzes.addQuestion({
        quizId: quiz.id,
        senseId: sense.id,
        type: draft.type,
        payloadJson: JSON.stringify(stored),
      });
      return this.toView(row.id, stored);
    });
    return { quizId: quiz.id, questions };
  }

  answer(questionId: number, answer: string): QuizAnswerResult {
    const { repos } = this.deps;
    const row = repos.quizzes.question(questionId);
    if (!row) throw new Error(`Questão ${questionId} não encontrada.`);
    const stored = StoredQuestionSchema.parse(JSON.parse(row.payloadJson));

    // Quem já respondeu não troca a resposta: a primeira é a que vale.
    const given = row.userAnswer ?? answer;
    const graded = gradeAnswer(stored, given);
    if (row.userAnswer === null) repos.quizzes.recordAnswer(questionId, given, graded.correct);

    const sense = repos.senses.byId(row.senseId)!;
    return {
      correct: graded.correct,
      correctAnswer: stored.answer,
      word: sense.lemma,
      translation: sense.translation,
      explanation: stored.explanation,
      matchResults: graded.matchResults,
    };
  }

  finish(quizId: number): QuizResult {
    const { repos, now } = this.deps;
    const quiz = repos.quizzes.byId(quizId);
    if (!quiz) throw new Error(`Quiz ${quizId} não encontrado.`);

    const rows = repos.quizzes.questions(quizId);
    const parsed = rows.map((row) => ({
      row,
      stored: StoredQuestionSchema.parse(JSON.parse(row.payloadJson)),
    }));
    const score = rows.filter((row) => row.correct === true).length;

    if (quiz.finishedAt === null) {
      this.updateReviews(parsed);
      repos.quizzes.finish(quizId, score, now());
    }

    return {
      quizId,
      sessionId: quiz.sessionId,
      score,
      total: rows.length,
      mistakes: parsed
        .filter(({ row }) => row.correct === false)
        .map(({ row, stored }) => this.toMistake(row, stored)),
    };
  }

  async reviewMistakes(quizId: number): Promise<QuizView> {
    const { repos } = this.deps;
    const quiz = repos.quizzes.byId(quizId);
    if (!quiz) throw new Error(`Quiz ${quizId} não encontrado.`);

    const senseIds = new Set<number>();
    for (const row of repos.quizzes.questions(quizId)) {
      if (row.correct !== false) continue;
      const stored = StoredQuestionSchema.parse(JSON.parse(row.payloadJson));
      if (stored.pairSenses) Object.values(stored.pairSenses).forEach((id) => senseIds.add(id));
      else senseIds.add(row.senseId);
    }
    return this.create(quiz.sessionId, [...senseIds]);
  }

  private async draftQuestions(
    words: FallbackWord[],
    bySense: Map<string, WordSense>,
  ): Promise<QuizQuestionDraft[]> {
    const { getProvider, shuffle } = this.deps;
    const fallback = () => buildFallbackQuiz(words, QUIZ_QUESTIONS, shuffle);
    const provider = getProvider();
    if (!provider) return fallback();

    try {
      const generated = await provider.generateQuiz(words);
      const usable = sanitizeDrafts(generated, QUIZ_QUESTIONS, shuffle).filter((draft) =>
        this.refersToKnownWords(draft, bySense),
      );
      return usable.length > 0 ? usable : fallback();
    } catch {
      return fallback();
    }
  }

  private refersToKnownWords(draft: QuizQuestionDraft, bySense: Map<string, WordSense>) {
    if (draft.pairs) return draft.pairs.every((pair) => bySense.has(pair.word.toLowerCase()));
    return bySense.has(draft.word.toLowerCase());
  }

  private senseOf(draft: QuizQuestionDraft, bySense: Map<string, WordSense>) {
    const word = draft.pairs?.[0]?.word ?? draft.word;
    return bySense.get(word.toLowerCase());
  }

  private toQuizWord(sense: WordSense, sessionId: number): FallbackWord {
    const { sessionWords } = this.deps.repos;
    const context =
      sessionWords.forSense(sessionId, sense.id) ?? sessionWords.latestForSense(sense.id);
    return {
      word: sense.lemma,
      translation: sense.translation,
      explanation: sense.explanation,
      sentence: context?.contextSentence ?? sense.exampleEn,
      surface: sense.lemma,
    };
  }

  /** A origem da frase, mostrada embaixo da lacuna como no mockup. */
  private contextFor(
    draft: QuizQuestionDraft,
    sense: WordSense,
    session: { id: number; title: string; startedAt: number },
  ): string | null {
    if (draft.type !== 'cloze') return null;
    const seen = this.deps.repos.sessionWords.forSense(session.id, sense.id);
    if (!seen) return session.title;
    return `${session.title} · ${formatElapsed(seen.firstSeenAt - session.startedAt)}`;
  }

  private toView(id: number, stored: StoredQuestion): QuizQuestionView {
    return {
      id,
      type: stored.type,
      prompt: stored.prompt,
      options: stored.pairs
        ? this.deps.shuffle(stored.pairs.map((pair) => pair.meaning))
        : stored.options,
      matchWords: stored.pairs?.map((pair) => pair.word) ?? null,
      context: stored.context,
    };
  }

  private updateReviews(parsed: { row: QuizQuestionRow; stored: StoredQuestion }[]) {
    const { repos, now } = this.deps;
    const outcomes = new Map<number, boolean>();
    const record = (senseId: number, correct: boolean) =>
      outcomes.set(senseId, (outcomes.get(senseId) ?? true) && correct);

    for (const { row, stored } of parsed) {
      if (row.correct === null) continue;
      if (stored.pairSenses && row.userAnswer !== null) {
        const { matchResults } = gradeAnswer(stored, row.userAnswer);
        for (const pair of matchResults ?? []) {
          const senseId = stored.pairSenses[pair.word];
          if (senseId !== undefined) record(senseId, pair.correct);
        }
      } else {
        record(row.senseId, row.correct);
      }
    }
    for (const [senseId, correct] of outcomes) {
      repos.reviews.upsert(senseId, nextReview(repos.reviews.get(senseId), correct, now()));
    }
  }

  private toMistake(row: QuizQuestionRow, stored: StoredQuestion): QuizMistake {
    const sense = this.deps.repos.senses.byId(row.senseId)!;
    const given = row.userAnswer ?? '';
    if (stored.pairs) {
      const { matchResults } = gradeAnswer(stored, given);
      const wrong = (matchResults ?? []).filter((pair) => !pair.correct);
      const chosen = JSON.parse(given || '{}') as Record<string, string>;
      return {
        word: wrong[0]?.word ?? sense.lemma,
        type: stored.type,
        userAnswer: wrong.map((pair) => `${pair.word} = ${chosen[pair.word] ?? '—'}`).join(', '),
        correctAnswer: wrong.map((pair) => `${pair.word} = ${pair.meaning}`).join(', '),
        explanation: stored.explanation,
      };
    }
    return {
      word: sense.lemma,
      type: stored.type,
      userAnswer: given,
      correctAnswer: stored.answer,
      explanation: stored.explanation,
    };
  }
}
