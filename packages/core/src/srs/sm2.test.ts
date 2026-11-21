import { describe, expect, it } from 'vitest';
import { answerQuality, DAY_MS, isDue, isMastered, nextReview } from './sm2';

const now = 1_000_000;
const RIGHT = 4;
const WRONG = 1;

describe('nextReview', () => {
  it('schedules a first correct answer in 3 days, as in the mockup', () => {
    const review = nextReview(null, RIGHT, now);
    expect(review).toMatchObject({ repetitions: 1, intervalDays: 3, dueAt: now + 3 * DAY_MS });
  });

  it('schedules a first wrong answer for tomorrow', () => {
    const review = nextReview(null, WRONG, now);
    expect(review).toMatchObject({ repetitions: 0, intervalDays: 1, dueAt: now + DAY_MS });
  });

  it('uses 6 days for the second correct answer', () => {
    const first = nextReview(null, RIGHT, now);
    expect(nextReview(first, RIGHT, now).intervalDays).toBe(6);
  });

  it('multiplies the interval by the ease after that', () => {
    const first = nextReview(null, RIGHT, now);
    const second = nextReview(first, RIGHT, now);
    const third = nextReview(second, RIGHT, now);
    expect(third.intervalDays).toBe(Math.round(6 * second.ease));
  });

  it('resets the repetitions after a wrong answer', () => {
    const first = nextReview(null, RIGHT, now);
    const second = nextReview(first, WRONG, now);
    expect(second).toMatchObject({ repetitions: 0, intervalDays: 1 });
  });

  it('lowers the ease after a wrong answer', () => {
    const first = nextReview(null, RIGHT, now);
    expect(nextReview(first, WRONG, now).ease).toBeLessThan(first.ease);
  });

  it('never lets the ease fall below 1.3', () => {
    let review = nextReview(null, WRONG, now);
    for (let i = 0; i < 20; i++) review = nextReview(review, WRONG, now);
    expect(review.ease).toBe(1.3);
  });

  it('raises the ease more for an answer that took recall than for a lucky guess', () => {
    expect(nextReview(null, 5, now).ease).toBeGreaterThan(nextReview(null, 3, now).ease);
  });
});

describe('answerQuality', () => {
  it.each([
    ['type_word', null, 5],
    ['cloze', null, 5],
    ['cloze', ['a', 'b'], 4],
    ['mc_en_pt', ['a', 'b'], 4],
    ['context_sense', ['a', 'b'], 4],
    ['match', null, 4],
    ['true_false', null, 3],
  ] as const)('rates a right %s answer with options %j as %i', (type, options, quality) => {
    expect(answerQuality({ type, options }, true)).toBe(quality);
  });

  it('fails any wrong answer', () => {
    expect(answerQuality({ type: 'type_word', options: null }, false)).toBe(1);
  });
});

describe('review state', () => {
  it('takes a word right three times in a row as mastered while it is not due', () => {
    expect(isMastered({ repetitions: 3, dueAt: now + DAY_MS }, now)).toBe(true);
    expect(isMastered({ repetitions: 3, dueAt: now }, now)).toBe(false);
    expect(isMastered({ repetitions: 2, dueAt: now + DAY_MS }, now)).toBe(false);
  });

  it('is due once the date arrives', () => {
    expect(isDue({ dueAt: now }, now)).toBe(true);
    expect(isDue({ dueAt: now + 1 }, now)).toBe(false);
  });
});
