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

const offline = () =>
  vi.fn(async (_batch: EnrichRequestWord[]): Promise<EnrichedWord[]> => {
    throw new Error('offline');
  });

/** Uma chamada que só termina quando o teste manda. */
function heldCalls() {
  const finish: (() => void)[] = [];
  const enrich = vi.fn(
    (batch: EnrichRequestWord[]) =>
      new Promise<EnrichedWord[]>((resolve) => {
        finish.push(() => resolve(batch.map(answer)));
      }),
  );
  return { enrich, finish };
}

const lemmasOf = (call: EnrichRequestWord[] | undefined) => call?.map((word) => word.lemma);

describe('EnrichQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('a word on the screen', () => {
    it('is sent right away, without waiting for others', async () => {
      const { queue, enrich } = setup();
      queue.add(request('reckon'));
      await vi.advanceTimersByTimeAsync(0);
      expect(enrich).toHaveBeenCalledTimes(1);
    });

    it('does not wait for a call that is already running', async () => {
      const { enrich } = heldCalls();
      const { queue } = setup(enrich);
      queue.addAhead(request('grumpy'));
      await vi.advanceTimersByTimeAsync(1_500);
      expect(enrich).toHaveBeenCalledTimes(1);

      queue.add(request('reckon'));
      await vi.advanceTimersByTimeAsync(0);
      expect(enrich).toHaveBeenCalledTimes(2);
      expect(lemmasOf(enrich.mock.calls[1]?.[0])).toEqual(['reckon']);
    });

    it('waits when two calls are already running', async () => {
      const { enrich, finish } = heldCalls();
      const { queue } = setup(enrich);
      queue.add(request('a'));
      await vi.advanceTimersByTimeAsync(0);
      queue.add(request('b'));
      await vi.advanceTimersByTimeAsync(0);
      queue.add(request('c'));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(enrich).toHaveBeenCalledTimes(2);

      finish[0]?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(enrich).toHaveBeenCalledTimes(3);
    });

    it('travels ahead of the words being translated early in the same call', async () => {
      const { queue, enrich } = setup();
      queue.addAhead(request('grumpy'));
      queue.add(request('reckon'));
      await vi.advanceTimersByTimeAsync(0);
      expect(enrich).toHaveBeenCalledTimes(1);
      expect(lemmasOf(enrich.mock.calls[0]?.[0])).toEqual(['reckon', 'grumpy']);
    });
  });

  describe('a word translated ahead', () => {
    it('waits a moment so nearby captions share the call', async () => {
      const { queue, enrich } = setup();
      queue.addAhead(request('grumpy'));
      await vi.advanceTimersByTimeAsync(1_000);
      queue.addAhead(request('wary'));
      await vi.advanceTimersByTimeAsync(499);
      expect(enrich).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(enrich).toHaveBeenCalledTimes(1);
      expect(lemmasOf(enrich.mock.calls[0]?.[0])).toEqual(['grumpy', 'wary']);
    });

    it('becomes urgent when its card appears', async () => {
      const { queue, enrich } = setup();
      queue.addAhead(request('grumpy'));
      queue.add(request('grumpy'));
      await vi.advanceTimersByTimeAsync(0);
      expect(enrich).toHaveBeenCalledTimes(1);
      expect(enrich.mock.calls[0]?.[0]).toHaveLength(1);
    });

    it('does not start a call while another one is running', async () => {
      const { enrich } = heldCalls();
      const { queue } = setup(enrich);
      queue.add(request('reckon'));
      await vi.advanceTimersByTimeAsync(0);
      queue.addAhead(request('grumpy'));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(enrich).toHaveBeenCalledTimes(1);
    });

    it('leaves part of the calls of the minute to the words on the screen', async () => {
      const { queue, enrich } = setup();
      for (let i = 0; i < 60; i++) queue.addAhead(request(`w${i}`));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(enrich).toHaveBeenCalledTimes(6);

      queue.add(request('reckon'));
      await vi.advanceTimersByTimeAsync(0);
      expect(enrich).toHaveBeenCalledTimes(7);
    });

    it('is dropped without a notice or a new try when the call fails', async () => {
      const { queue, enrich, onFailure } = setup(offline());
      queue.addAhead(request('grumpy'));
      await vi.advanceTimersByTimeAsync(1_500);
      expect(enrich).toHaveBeenCalledTimes(1);
      expect(onFailure).not.toHaveBeenCalled();
      expect(queue.pending).toBe(0);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(enrich).toHaveBeenCalledTimes(1);
    });

    it('fails alone when it shared the call with a word on the screen', async () => {
      const { queue, enrich } = setup(offline());
      queue.addAhead(request('grumpy'));
      queue.add(request('reckon'));
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(enrich).toHaveBeenCalledTimes(2);
      expect(lemmasOf(enrich.mock.calls[1]?.[0])).toEqual(['reckon']);
    });

    it('is retried when its card appeared while the call was running', async () => {
      let online = false;
      const finish: (() => void)[] = [];
      const enrich = vi.fn(
        (batch: EnrichRequestWord[]) =>
          new Promise<EnrichedWord[]>((resolve, reject) => {
            finish.push(() => (online ? resolve(batch.map(answer)) : reject(new Error('offline'))));
          }),
      );
      const { queue, onResult, onFailure } = setup(enrich);
      queue.addAhead(request('grumpy'));
      await vi.advanceTimersByTimeAsync(1_500);
      queue.add(request('grumpy'));
      expect(queue.pending).toBe(1);

      finish[0]?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(onFailure).toHaveBeenCalledWith(1);

      online = true;
      await vi.advanceTimersByTimeAsync(2_000);
      finish[1]?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(onResult).toHaveBeenCalledTimes(1);
    });

    it('does not count as a word waiting on the screen', () => {
      const { queue } = setup();
      queue.addAhead(request('grumpy'));
      expect(queue.pending).toBe(0);
    });
  });

  it('never sends more than 5 words in a call', async () => {
    const { queue, enrich } = setup();
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((word) => queue.add(request(word)));
    await vi.advanceTimersByTimeAsync(1);
    expect(enrich.mock.calls.map(([batch]) => batch.length)).toEqual([5, 2]);
  });

  it('ignores a word that is already waiting', async () => {
    const { queue, enrich } = setup();
    queue.add(request('reckon'));
    queue.add(request('reckon'));
    await vi.advanceTimersByTimeAsync(0);
    expect(enrich.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('delivers each result with its request', async () => {
    const { queue, onResult } = setup();
    const word = request('reckon');
    queue.add(word);
    await vi.advanceTimersByTimeAsync(0);
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
    await vi.advanceTimersByTimeAsync(0);
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
    const enrich = offline();
    const { queue, onFailure } = setup(enrich);
    queue.add(request('reckon'));
    await vi.advanceTimersByTimeAsync(0);
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
    await vi.advanceTimersByTimeAsync(0);
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

  it('flush waits for every call that is running', async () => {
    const { enrich, finish } = heldCalls();
    const { queue, onResult } = setup(enrich);
    queue.add(request('a'));
    await vi.advanceTimersByTimeAsync(0);
    queue.add(request('b'));
    await vi.advanceTimersByTimeAsync(0);

    const flushed = queue.flush();
    finish[0]?.();
    finish[1]?.();
    await flushed;
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it('flush gives up on the words translated ahead', async () => {
    const { queue, enrich } = setup();
    queue.addAhead(request('grumpy'));
    await queue.flush();
    expect(enrich).not.toHaveBeenCalled();
  });

  it('flush gives up after one failed try', async () => {
    const enrich = offline();
    const { queue } = setup(enrich);
    queue.add(request('reckon'));
    await queue.flush();
    expect(enrich).toHaveBeenCalledTimes(1);
  });

  it('clear drops what is waiting and stops the timers', async () => {
    const { queue, enrich } = setup();
    queue.add(request('reckon'));
    queue.addAhead(request('grumpy'));
    queue.clear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(enrich).not.toHaveBeenCalled();
    expect(queue.pending).toBe(0);
  });
});
