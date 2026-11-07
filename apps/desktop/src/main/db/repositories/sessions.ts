import { desc, eq } from 'drizzle-orm';
import { sessions } from '@legendary/db';
import type { Db } from '../client';

export type SessionRow = typeof sessions.$inferSelect;
type NewSession = Pick<typeof sessions.$inferInsert, 'title' | 'source' | 'startedAt'>;

export function sessionsRepository(db: Db) {
  return {
    create: (session: NewSession): SessionRow =>
      db.insert(sessions).values(session).returning().get(),
    byId: (id: number) => db.select().from(sessions).where(eq(sessions.id, id)).get(),
    end(id: number, endedAt: number) {
      db.update(sessions).set({ endedAt }).where(eq(sessions.id, id)).run();
    },
    setTitle(id: number, title: string) {
      db.update(sessions).set({ title }).where(eq(sessions.id, id)).run();
    },
    list: (): SessionRow[] => db.select().from(sessions).orderBy(desc(sessions.startedAt)).all(),
  };
}
