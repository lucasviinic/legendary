import type { Db } from '../client';
import { historyRepository } from './history';
import { knownRepository } from './known';
import { quizzesRepository } from './quizzes';
import { reviewsRepository } from './reviews';
import { savedRepository } from './saved';
import { sensesRepository } from './senses';
import { sessionWordsRepository } from './session-words';
import { sessionsRepository } from './sessions';
import { settingsRepository } from './settings';

export function createRepositories(db: Db) {
  return {
    senses: sensesRepository(db),
    sessions: sessionsRepository(db),
    sessionWords: sessionWordsRepository(db),
    known: knownRepository(db),
    saved: savedRepository(db),
    quizzes: quizzesRepository(db),
    reviews: reviewsRepository(db),
    settings: settingsRepository(db),
    history: historyRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
