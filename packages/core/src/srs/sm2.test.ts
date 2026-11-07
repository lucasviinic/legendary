import { describe, expect, it } from 'vitest';
import { DAY_MS, nextReview } from './sm2';

const now = 1_000_000;

describe('nextReview', () => {
  it('schedules a first correct answer in 3 days, as in the mockup', () => {
    const review = nextReview(null, true, now);
    expect(review).toMatchObject({ repetitions: 1, intervalDays: 3, dueAt: now + 3 * DAY_MS });
  });

  it('schedules a first wrong answer for tomorrow', () => {
    const review = nextReview(null, false, now);
    expect(review).toMatchObject({ repetitions: 0, intervalDays: 1, dueAt: now + DAY_MS });
  });

  it('uses 6 days for the second correct answer', () => {
    const first = nextReview(null, true, now);
    expect(nextReview(first, true, now).intervalDays).toBe(6);
  });

  it('multiplies the interval by the ease after that', () => {
    const first = nextReview(null, true, now);
    const second = nextReview(first, true, now);
    const third = nextReview(second, true, now);
    expect(third.intervalDays).toBe(Math.round(6 * second.ease));
  });

  it('resets the repetitions after a wrong answer', () => {
    const first = nextReview(null, true, now);
    const second = nextReview(first, false, now);
    expect(second).toMatchObject({ repetitions: 0, intervalDays: 1 });
  });

  it('lowers the ease after a wrong answer', () => {
    const first = nextReview(null, true, now);
    expect(nextReview(first, false, now).ease).toBeLessThan(first.ease);
  });

  it('never lets the ease fall below 1.3', () => {
    let review = nextReview(null, false, now);
    for (let i = 0; i < 20; i++) review = nextReview(review, false, now);
    expect(review.ease).toBe(1.3);
  });
});
