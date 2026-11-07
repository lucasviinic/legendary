import { and, asc, count, desc, eq, lte, sql, type SQL } from 'drizzle-orm';
import type { HistoryWord, HistoryWordsRequest } from '@legendary/contracts';
import {
  quizQuestions,
  quizzes,
  reviews,
  savedWords,
  sessionWords,
  wordSenses,
} from '@legendary/db';
import type { Db } from '../client';

const LEVELS = new Set(['B1', 'B2', 'C1']);

const answeredWhere = (sessionId: number | null) =>
  sessionId === null ? sql`` : sql`and ${quizzes.sessionId} = ${sessionId}`;

/** Consultas de leitura da janela de histórico, que cruzam várias tabelas. */
export function historyRepository(db: Db) {
  const answered = (sessionId: number | null) =>
    sql<number>`(select count(*) from ${quizQuestions} join ${quizzes} on ${quizzes.id} = ${quizQuestions.quizId}
      where ${quizQuestions.senseId} = ${wordSenses.id} and ${quizQuestions.correct} is not null ${answeredWhere(sessionId)})`;
  const correct = (sessionId: number | null) =>
    sql<number>`(select count(*) from ${quizQuestions} join ${quizzes} on ${quizzes.id} = ${quizQuestions.quizId}
      where ${quizQuestions.senseId} = ${wordSenses.id} and ${quizQuestions.correct} = 1 ${answeredWhere(sessionId)})`;

  function conditions(request: HistoryWordsRequest, endOfToday: number): SQL[] {
    const { scope, filter, search } = request;
    const sessionId = scope.kind === 'session' ? scope.sessionId : null;
    const list: SQL[] = [];

    if (sessionId !== null) list.push(eq(sessionWords.sessionId, sessionId));
    if (scope.kind === 'saved' || filter === 'saved')
      list.push(sql`${savedWords.senseId} is not null`);
    if (scope.kind === 'due') list.push(lte(reviews.dueAt, endOfToday));
    if (filter === 'wrong') list.push(sql`${answered(sessionId)} > ${correct(sessionId)}`);
    if (LEVELS.has(filter)) list.push(eq(wordSenses.cefr, filter));
    if (search.trim()) {
      const pattern = `%${search
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, '\\$&')}%`;
      list.push(
        sql`(lower(${wordSenses.lemma}) like ${pattern} escape '\\' or lower(${wordSenses.translation}) like ${pattern} escape '\\')`,
      );
    }
    return list;
  }

  return {
    words(
      request: HistoryWordsRequest,
      endOfToday: number,
    ): { rows: HistoryWord[]; total: number } {
      const sessionId = request.scope.kind === 'session' ? request.scope.sessionId : null;
      const where = and(...conditions(request, endOfToday));

      const rows = db
        .select({
          senseId: wordSenses.id,
          lemma: wordSenses.lemma,
          translation: wordSenses.translation,
          seen: sql<number>`sum(${sessionWords.count})`,
          correct: correct(sessionId),
          answered: answered(sessionId),
          cefr: wordSenses.cefr,
          dueAt: reviews.dueAt,
          savedAt: savedWords.savedAt,
        })
        .from(wordSenses)
        .innerJoin(sessionWords, eq(sessionWords.senseId, wordSenses.id))
        .leftJoin(savedWords, eq(savedWords.senseId, wordSenses.id))
        .leftJoin(reviews, eq(reviews.senseId, wordSenses.id))
        .where(where)
        .groupBy(wordSenses.id)
        .orderBy(asc(sql`min(${sessionWords.firstSeenAt})`), asc(wordSenses.id))
        .limit(request.limit)
        .offset(request.offset)
        .all();

      const totalRow = db
        .select({ total: sql<number>`count(distinct ${wordSenses.id})` })
        .from(wordSenses)
        .innerJoin(sessionWords, eq(sessionWords.senseId, wordSenses.id))
        .leftJoin(savedWords, eq(savedWords.senseId, wordSenses.id))
        .leftJoin(reviews, eq(reviews.senseId, wordSenses.id))
        .where(where)
        .get();

      return {
        total: totalRow?.total ?? 0,
        rows: rows.map(({ savedAt, cefr, ...row }) => ({
          ...row,
          cefr: cefr as HistoryWord['cefr'],
          saved: savedAt !== null,
        })),
      };
    },

    counts(endOfToday: number) {
      const all = db
        .select({ total: sql<number>`count(distinct ${sessionWords.senseId})` })
        .from(sessionWords)
        .get();
      const saved = db.select({ total: count() }).from(savedWords).get();
      const dueToday = db
        .select({ total: count() })
        .from(reviews)
        .where(lte(reviews.dueAt, endOfToday))
        .get();
      return {
        all: all?.total ?? 0,
        saved: saved?.total ?? 0,
        dueToday: dueToday?.total ?? 0,
      };
    },

    wordCount(sessionId: number): number {
      const row = db
        .select({ total: count() })
        .from(sessionWords)
        .where(eq(sessionWords.sessionId, sessionId))
        .get();
      return row?.total ?? 0;
    },

    questionCount(quizId: number): number {
      const row = db
        .select({ total: count() })
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, quizId))
        .orderBy(desc(quizQuestions.id))
        .get();
      return row?.total ?? 0;
    },
  };
}
