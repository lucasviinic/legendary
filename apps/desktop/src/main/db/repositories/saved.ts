import { and, count, eq } from 'drizzle-orm';
import { savedWords, sessionWords } from '@legendary/db';
import type { Db } from '../client';

export function savedRepository(db: Db) {
  const isSaved = (senseId: number) =>
    db.select().from(savedWords).where(eq(savedWords.senseId, senseId)).get() !== undefined;

  return {
    isSaved,
    /** Inverte o estado e devolve se a palavra ficou salva. */
    toggle(senseId: number, savedAt: number): boolean {
      if (isSaved(senseId)) {
        db.delete(savedWords).where(eq(savedWords.senseId, senseId)).run();
        return false;
      }
      db.insert(savedWords).values({ senseId, savedAt }).run();
      return true;
    },
    countForSession(sessionId: number): number {
      const row = db
        .select({ total: count() })
        .from(savedWords)
        .innerJoin(
          sessionWords,
          and(eq(sessionWords.senseId, savedWords.senseId), eq(sessionWords.sessionId, sessionId)),
        )
        .get();
      return row?.total ?? 0;
    },
  };
}
