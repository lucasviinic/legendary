import { knownWords } from '@legendary/db';
import type { Db } from '../client';

export function knownRepository(db: Db) {
  return {
    add(lemma: string, markedAt: number) {
      db.insert(knownWords).values({ lemma, markedAt }).onConflictDoNothing().run();
    },
    all: (): Set<string> =>
      new Set(
        db
          .select({ lemma: knownWords.lemma })
          .from(knownWords)
          .all()
          .map((row) => row.lemma),
      ),
  };
}
