import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatSessionHeader,
  formatSessionMeta,
  sourceLabel,
  formatElapsed,
  formatNextReview,
  questionTypeLabel,
  scoreHeadline,
  sessionGroupLabel,
} from './format';

const DAY = 86_400_000;
const now = new Date(2026, 10, 6, 21, 40).getTime();

describe('formatElapsed', () => {
  it.each([
    [0, '00:00'],
    [59_000, '00:59'],
    [24 * 60_000 + 12_000, '24:12'],
    [65 * 60_000, '1:05:00'],
  ])('%i ms is %s', (ms, text) => {
    expect(formatElapsed(ms)).toBe(text);
  });
});

describe('formatDuration', () => {
  it('rounds to minutes', () => {
    expect(formatDuration(42 * 60_000 + 18_000)).toBe('42 min');
  });

  it('shows at least one minute', () => {
    expect(formatDuration(10_000)).toBe('1 min');
  });
});

describe('formatNextReview', () => {
  it.each([
    [null, 'Após o quiz'],
    [now - DAY, 'Hoje'],
    [now + 60_000, 'Hoje'],
    [now + DAY, 'Amanhã'],
    [now + 3 * DAY, 'Em 3 dias'],
  ])('%s becomes %s', (dueAt, text) => {
    expect(formatNextReview(dueAt, now)).toBe(text);
  });
});

describe('sessionGroupLabel', () => {
  it.each([
    [now - 60_000, 'Hoje'],
    [now - DAY, 'Ontem'],
    [now - 3 * DAY, 'Esta semana'],
    [now - 30 * DAY, 'Mais antigas'],
  ])('%s becomes %s', (startedAt, text) => {
    expect(sessionGroupLabel(startedAt, now)).toBe(text);
  });
});

describe('questionTypeLabel', () => {
  it('uses the wording of the mockup', () => {
    expect(questionTypeLabel('cloze')).toBe('Completar lacuna');
    expect(questionTypeLabel('match')).toBe('Associar');
    expect(questionTypeLabel('context_sense')).toBe('Sentido no contexto');
    expect(questionTypeLabel('type_word')).toBe('Escrever a palavra');
  });
});

describe('scoreHeadline', () => {
  it.each([
    [10, 10, 'Perfeito.'],
    [8, 10, 'Muito bom.'],
    [6, 10, 'Bom começo.'],
    [2, 10, 'Vale revisar.'],
    [0, 0, 'Vale revisar.'],
  ])('%i of %i says %s', (score, total, text) => {
    expect(scoreHeadline(score, total)).toBe(text);
  });
});

describe('sourceLabel', () => {
  it.each([
    ['netflix', 'Netflix'],
    ['youtube', 'YouTube'],
    ['audio', 'Áudio'],
  ] as const)('%s is %s', (source, label) => {
    expect(sourceLabel(source)).toBe(label);
  });
});

describe('formatSessionMeta', () => {
  const session = {
    source: 'netflix',
    durationMs: 42 * 60_000,
    wordCount: 18,
    quiz: { score: 8, total: 10 },
  } as const;

  it('uses the wording of the mockup', () => {
    expect(formatSessionMeta(session)).toBe('42 min · 18 palavras · 8/10');
  });

  it('names YouTube and leaves out a missing quiz', () => {
    expect(
      formatSessionMeta({
        ...session,
        source: 'youtube',
        durationMs: 14 * 60_000,
        wordCount: 6,
        quiz: null,
      }),
    ).toBe('YouTube · 14 min · 6 palavras');
  });

  it('uses the singular for one word', () => {
    expect(formatSessionMeta({ ...session, wordCount: 1, quiz: null })).toBe('42 min · 1 palavra');
  });
});

describe('formatSessionHeader', () => {
  const session = {
    source: 'netflix',
    startedAt: new Date(2026, 10, 6, 21, 2).getTime(),
    durationMs: 42 * 60_000 + 18_000,
    quiz: { score: 8, total: 10 },
  } as const;

  it('uses the wording of the mockup', () => {
    expect(formatSessionHeader(session, now)).toBe('Hoje, 21:02 · 42:18 · Netflix · quiz 8/10');
  });

  it('says yesterday', () => {
    expect(formatSessionHeader(session, now + DAY)).toBe(
      'Ontem, 21:02 · 42:18 · Netflix · quiz 8/10',
    );
  });

  it('shows the date for older sessions', () => {
    expect(formatSessionHeader({ ...session, quiz: null }, now + 5 * DAY)).toBe(
      '06/11, 21:02 · 42:18 · Netflix',
    );
  });
});
