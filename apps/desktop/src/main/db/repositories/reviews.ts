import { asc, eq, lte } from 'drizzle-orm';
import type { ReviewState } from '@legendary/core';
import { reviews } from '@legendary/db';
import type { Db } from '../client';

export function reviewsRepository(db: Db) {
  return {
    get(senseId: number): ReviewState | null {
      const row = db.select().from(reviews).where(eq(reviews.senseId, senseId)).get();
      if (!row) return null;
      const { ease, intervalDays, repetitions, dueAt } = row;
      return { ease, intervalDays, repetitions, dueAt };
    },
    upsert(senseId: number, state: ReviewState) {
      db.insert(reviews)
        .values({ senseId, ...state })
        .onConflictDoUpdate({ target: reviews.senseId, set: state })
        .run();
    },
    dueSenseIds: (until: number): number[] =>
      db
        .select({ senseId: reviews.senseId })
        .from(reviews)
        .where(lte(reviews.dueAt, until))
        .orderBy(asc(reviews.dueAt))
        .all()
        .map((row) => row.senseId),
  };
}
