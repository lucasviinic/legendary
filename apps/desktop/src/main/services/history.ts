import type { HistoryList, HistoryWords, HistoryWordsRequest } from '@legendary/contracts';
import type { Repositories } from '../db/repositories';

export class HistoryService {
  constructor(private readonly deps: { repos: Repositories; now: () => number }) {}

  list(): HistoryList {
    const { repos } = this.deps;
    return {
      counts: repos.history.counts(this.endOfToday()),
      sessions: repos.sessions.list().map((session) => {
        const quiz = repos.quizzes.latestFinished(session.id);
        return {
          id: session.id,
          title: session.title,
          source: session.source,
          startedAt: session.startedAt,
          durationMs: session.endedAt === null ? 0 : session.endedAt - session.startedAt,
          wordCount: repos.history.wordCount(session.id),
          quiz:
            quiz?.score == null
              ? null
              : { score: quiz.score, total: repos.history.questionCount(quiz.id) },
        };
      }),
    };
  }

  words(request: HistoryWordsRequest): HistoryWords {
    return this.deps.repos.history.words(request, this.endOfToday());
  }

  private endOfToday(): number {
    return new Date(this.deps.now()).setHours(23, 59, 59, 999);
  }
}
