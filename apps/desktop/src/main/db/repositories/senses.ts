import { and, eq, inArray } from 'drizzle-orm';
import { wordSenses } from '@legendary/db';
import type { Db } from '../client';

export type WordSense = typeof wordSenses.$inferSelect;
export type NewWordSense = Omit<typeof wordSenses.$inferInsert, 'id' | 'createdAt'>;

export function sensesRepository(db: Db) {
  const findByLemmaPos = (lemma: string, pos: string): WordSense | undefined =>
    db
      .select()
      .from(wordSenses)
      .where(and(eq(wordSenses.lemma, lemma), eq(wordSenses.pos, pos)))
      .get();

  return {
    findByLemmaPos,
    byId: (id: number) => db.select().from(wordSenses).where(eq(wordSenses.id, id)).get(),
    byIds: (ids: number[]) =>
      ids.length ? db.select().from(wordSenses).where(inArray(wordSenses.id, ids)).all() : [],
    /** Grava um sentido novo. Se já existir a mesma tradução, devolve o registro que está lá. */
    insert(sense: NewWordSense): WordSense {
      const inserted = db
        .insert(wordSenses)
        .values({ ...sense, createdAt: Date.now() })
        .onConflictDoNothing()
        .returning()
        .get();
      return (
        inserted ??
        db
          .select()
          .from(wordSenses)
          .where(
            and(
              eq(wordSenses.lemma, sense.lemma),
              eq(wordSenses.pos, sense.pos),
              eq(wordSenses.translation, sense.translation),
            ),
          )
          .get()!
      );
    },
  };
}
