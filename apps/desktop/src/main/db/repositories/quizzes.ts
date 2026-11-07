import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import { quizQuestions, quizzes } from '@legendary/db';
import type { Db } from '../client';

export type QuizRow = typeof quizzes.$inferSelect;
export type QuizQuestionRow = typeof quizQuestions.$inferSelect;
type NewQuestion = Pick<
  typeof quizQuestions.$inferInsert,
  'quizId' | 'senseId' | 'type' | 'payloadJson'
>;

export function quizzesRepository(db: Db) {
  return {
    create: (sessionId: number, createdAt: number): QuizRow =>
      db.insert(quizzes).values({ sessionId, createdAt }).returning().get(),
    byId: (id: number) => db.select().from(quizzes).where(eq(quizzes.id, id)).get(),
    addQuestion: (question: NewQuestion): QuizQuestionRow =>
      db.insert(quizQuestions).values(question).returning().get(),
    question: (id: number) => db.select().from(quizQuestions).where(eq(quizQuestions.id, id)).get(),
    questions: (quizId: number): QuizQuestionRow[] =>
      db.select().from(quizQuestions).where(eq(quizQuestions.quizId, quizId)).all(),
    recordAnswer(id: number, userAnswer: string, correct: boolean) {
      db.update(quizQuestions).set({ userAnswer, correct }).where(eq(quizQuestions.id, id)).run();
    },
    finish(id: number, score: number, finishedAt: number) {
      db.update(quizzes).set({ score, finishedAt }).where(eq(quizzes.id, id)).run();
    },
    /** Quantas vezes cada sentido já foi respondido errado. */
    wrongCounts(): Map<number, number> {
      const rows = db
        .select({ senseId: quizQuestions.senseId, total: count() })
        .from(quizQuestions)
        .where(eq(quizQuestions.correct, false))
        .groupBy(quizQuestions.senseId)
        .all();
      return new Map(rows.map((row) => [row.senseId, row.total]));
    },
    latestFinished: (sessionId: number) =>
      db
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.sessionId, sessionId), isNotNull(quizzes.finishedAt)))
        .orderBy(desc(quizzes.finishedAt), desc(quizzes.id))
        .get(),
  };
}
