import { and, asc, eq, inArray } from 'drizzle-orm';
import { quizQuestions, savedWords, sessionWords, wordSenses } from '@legendary/db';
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
    findAllByLemmaPos: (lemma: string, pos: string): WordSense[] =>
      db
        .select()
        .from(wordSenses)
        .where(and(eq(wordSenses.lemma, lemma), eq(wordSenses.pos, pos)))
        .orderBy(asc(wordSenses.id))
        .all(),
    studiedLemmas(): Set<string> {
      const lemma = { lemma: wordSenses.lemma };
      const saved = db
        .select(lemma)
        .from(wordSenses)
        .innerJoin(savedWords, eq(savedWords.senseId, wordSenses.id))
        .all();
      const missed = db
        .select(lemma)
        .from(wordSenses)
        .innerJoin(quizQuestions, eq(quizQuestions.senseId, wordSenses.id))
        .where(eq(quizQuestions.correct, false))
        .all();
      const searched = db
        .select(lemma)
        .from(wordSenses)
        .innerJoin(sessionWords, eq(sessionWords.senseId, wordSenses.id))
        .where(eq(sessionWords.searched, true))
        .all();
      return new Set([...saved, ...missed, ...searched].map((row) => row.lemma));
    },
    findByLemma: (lemma: string): WordSense | undefined =>
      db.select().from(wordSenses).where(eq(wordSenses.lemma, lemma)).get(),
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
