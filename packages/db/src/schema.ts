import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const SOURCES = ['netflix', 'youtube', 'audio'] as const;

/** Cache global de sentidos. Palavra já explicada não volta para a IA. */
export const wordSenses = sqliteTable(
  'word_senses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lemma: text('lemma').notNull(),
    pos: text('pos').notNull(),
    translation: text('translation').notNull(),
    explanation: text('explanation').notNull(),
    exampleEn: text('example_en').notNull(),
    examplePt: text('example_pt').notNull(),
    cefr: text('cefr'),
    provider: text('provider').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('word_senses_lemma_pos_translation').on(table.lemma, table.pos, table.translation),
    index('word_senses_lemma_pos').on(table.lemma, table.pos),
  ],
);

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  source: text('source', { enum: SOURCES }).notNull(),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
});

export const sessionWords = sqliteTable(
  'session_words',
  {
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    senseId: integer('sense_id')
      .notNull()
      .references(() => wordSenses.id),
    count: integer('count').notNull(),
    contextSentence: text('context_sentence').notNull(),
    firstSeenAt: integer('first_seen_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.senseId] })],
);

export const knownWords = sqliteTable('known_words', {
  lemma: text('lemma').primaryKey(),
  markedAt: integer('marked_at').notNull(),
});

export const savedWords = sqliteTable('saved_words', {
  senseId: integer('sense_id')
    .primaryKey()
    .references(() => wordSenses.id),
  savedAt: integer('saved_at').notNull(),
});

export const quizzes = sqliteTable('quizzes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
  finishedAt: integer('finished_at'),
  score: integer('score'),
});

export const quizQuestions = sqliteTable(
  'quiz_questions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    quizId: integer('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    senseId: integer('sense_id')
      .notNull()
      .references(() => wordSenses.id),
    type: text('type').notNull(),
    payloadJson: text('payload_json').notNull(),
    userAnswer: text('user_answer'),
    correct: integer('correct', { mode: 'boolean' }),
  },
  (table) => [index('quiz_questions_quiz').on(table.quizId)],
);

/** Estado da revisão espaçada (SM-2). */
export const reviews = sqliteTable('reviews', {
  senseId: integer('sense_id')
    .primaryKey()
    .references(() => wordSenses.id),
  ease: real('ease').notNull(),
  intervalDays: integer('interval_days').notNull(),
  repetitions: integer('repetitions').notNull(),
  dueAt: integer('due_at').notNull(),
});

/** Preferências. A API key não fica aqui. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
});
