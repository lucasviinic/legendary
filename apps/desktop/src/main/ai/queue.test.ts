import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnrichRequestWord, EnrichedWord } from '@legendary/contracts';
import { EnrichQueue } from './queue';

const request = (lemma: string): EnrichRequestWord => ({
  lemma,
  pos: 'verb',
  surface: lemma,
  sentence: `I ${lemma}.`,
});

const answer = (word: EnrichRequestWord): EnrichedWord => ({
  lemma: word.lemma,
  pos: word.pos,
  translation: `t-${word.lemma}`,
  explanation: 'e',
  exampleEn: 'x',
  examplePt: 'y',
  cefr: 'B2',
});

function setup(enrich = vi.fn(async (batch: EnrichRequestWord[]) => batch.map(answer))) {
  const onResult = vi.fn();
  const onFailure = vi.fn();
  const onRecovered = vi.fn();
  const queue = new EnrichQueue({ enrich, onResult, onFailure, onRecovered });
  return { queue, enrich, onResult, onFailure, onRecovered };
}

describe('EnrichQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits up to 8 seconds before sending a small batch', async () => {
    const { queue, enrich } = setup();
    queue.add(request('reckon'));
    await vi.advanceTimersByTimeAsync(7_999);
    expect(enrich).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(enrich).toHaveBeenCalledTimes(1);
  });

  it('sends right away when 5 words are waiting', async () => {
    const { queue, enrich } = setup();
    ['a', 'b', 'c', 'd', 'e'].forEach((word) => queue.add(request(word)));
    await vi.advanceTimersByTimeAsync(0);
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(enrich.mock.calls[0]?.[0]).toHaveLength(5);
  });

  it('never sends more than 5 words in a call', async () => {
    const { queue, enrich } = setup();
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((word) => queue.add(request(word)));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(enrich.mock.calls.map(([batch]) => batch.length)).toEqual([5, 2]);
  });

  it('ignores a word that is already waiting', async () => {
    const { queue, enrich } = setup();
    queue.add(request('reckon'));
    queue.add(request('reckon'));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(enrich.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('delivers each result with its request', async () => {
    const { queue, onResult } = setup();
    const word = request('reckon');
    queue.add(word);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(onResult).toHaveBeenCalledWith(
      word,
      expect.objectContaining({ translation: 't-reckon' }),
    );
  });

  it('matches a result by lemma when the provider changes the part of speech', async () => {
    const { queue, onResult } = setup(
      vi.fn(async (batch: EnrichRequestWord[]) =>
        batch.map((word) => ({ ...answer(word), pos: 'noun' })),
      ),
    );
    queue.add(request('reckon'));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('limits to 10 calls per minute', async () => {
    const { queue, enrich } = setup();
    for (let i = 0; i < 60; i++) queue.add(request(`w${i}`));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(enrich).toHaveBeenCalledTimes(10);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(enrich.mock.calls.length).toBeGreaterThan(10);
  });

  it('retries a failed batch with growing waits', async () => {
    const enrich = vi.fn(async (_batch: EnrichRequestWord[]): Promise<EnrichedWord[]> => {
      throw new Error('offline');
    });
    const { queue, onFailure } = setup(enrich);
    queue.add(request('reckon'));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(enrich).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(enrich).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(enrich).toHaveBeenCalledTimes(3);
  });

  it('reports recovery after a failure', async () => {
    let online = false;
    const enrich = vi.fn(async (batch: EnrichRequestWord[]) => {
      if (!online) throw new Error('offline');
      return batch.map(answer);
    });
    const { queue, onRecovered, onResult } = setup(enrich);
    queue.add(request('reckon'));
    await vi.advanceTimersByTimeAsync(8_000);
    online = true;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onRecovered).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(queue.pending).toBe(0);
  });

  it('flush sends what is waiting without waiting for the timer', async () => {
    const { queue, enrich } = setup();
    queue.add(request('reckon'));
    await queue.flush();
    expect(enrich).toHaveBeenCalledTimes(1);
  });

  it('flush gives up after one failed try', async () => {
    const enrich = vi.fn(async (_batch: EnrichRequestWord[]): Promise<EnrichedWord[]> => {
      throw new Error('offline');
    });
    const { queue } = setup(enrich);
    queue.add(request('reckon'));
    await queue.flush();
    expect(enrich).toHaveBeenCalledTimes(1);
  });

  it('clear drops what is waiting and stops the timers', async () => {
    const { queue, enrich } = setup();
    queue.add(request('reckon'));
    queue.clear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(enrich).not.toHaveBeenCalled();
    expect(queue.pending).toBe(0);
  });
});
