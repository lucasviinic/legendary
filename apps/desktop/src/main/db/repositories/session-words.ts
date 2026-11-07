import { and, desc, eq } from 'drizzle-orm';
import { sessionWords } from '@legendary/db';
import type { Db } from '../client';

export type SessionWordRow = typeof sessionWords.$inferSelect;

export function sessionWordsRepository(db: Db) {
  return {
    /** Grava a palavra na sessão. A frase e o horário da primeira aparição não mudam depois. */
    upsert(word: SessionWordRow) {
      db.insert(sessionWords)
        .values(word)
        .onConflictDoUpdate({
          target: [sessionWords.sessionId, sessionWords.senseId],
          set: { count: word.count },
        })
        .run();
    },
    listForSession: (sessionId: number): SessionWordRow[] =>
      db.select().from(sessionWords).where(eq(sessionWords.sessionId, sessionId)).all(),
    forSense: (sessionId: number, senseId: number) =>
      db
        .select()
        .from(sessionWords)
        .where(and(eq(sessionWords.sessionId, sessionId), eq(sessionWords.senseId, senseId)))
        .get(),
    latestForSense: (senseId: number) =>
      db
        .select()
        .from(sessionWords)
        .where(eq(sessionWords.senseId, senseId))
        .orderBy(desc(sessionWords.firstSeenAt))
        .get(),
  };
}
