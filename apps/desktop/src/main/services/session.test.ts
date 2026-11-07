import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionEvent, EnrichRequestWord, EnrichedWord } from '@legendary/contracts';
import { createHarness, enriched, fakeProvider } from '../test/harness';

type Harness = ReturnType<typeof createHarness>;
let h: Harness;

const caption = (text: string, mediaTitle = 'Northbound · T1E3'): CaptionEvent => ({
  text,
  startedAt: 1,
  source: 'netflix',
  mediaTitle,
});

const settle = async () => {
  await vi.advanceTimersByTimeAsync(8_000);
};

beforeEach(() => {
  vi.useFakeTimers();
  h = createHarness();
});

afterEach(() => {
  h.close();
  vi.useRealTimers();
});

describe('session lifecycle', () => {
  it('starts idle', () => {
    expect(h.session.status()).toMatchObject({
      state: 'idle',
      elapsedMs: 0,
      newWords: 0,
      source: null,
    });
  });

  it('ignores captions while idle', () => {
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.events.cards).toEqual([]);
  });

  it('refuses the audio origin, which is not built yet', () => {
    expect(() => h.session.start('audio')).toThrow();
  });

  it('counts elapsed time while active', () => {
    h.session.start('browser');
    h.clock.now += 5_000;
    expect(h.session.status().elapsedMs).toBe(5_000);
  });

  it('stops the clock while paused', () => {
    h.session.start('browser');
    h.clock.now += 5_000;
    h.session.togglePause();
    h.clock.now += 60_000;
    expect(h.session.status()).toMatchObject({ state: 'paused', elapsedMs: 5_000 });
  });

  it('resumes the clock from where it stopped', () => {
    h.session.start('browser');
    h.clock.now += 5_000;
    h.session.togglePause();
    h.clock.now += 60_000;
    h.session.togglePause();
    h.clock.now += 1_000;
    expect(h.session.status()).toMatchObject({ state: 'active', elapsedMs: 6_000 });
  });

  it('shows no cards while paused', () => {
    h.session.start('browser');
    h.session.togglePause();
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.events.cards).toEqual([]);
  });

  it('creates the session on the first caption, with its title and source', () => {
    h.session.start('browser');
    expect(h.repos.sessions.list()).toHaveLength(0);
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.repos.sessions.list()[0]).toMatchObject({
      title: 'Northbound · T1E3',
      source: 'netflix',
    });
    expect(h.session.status().source).toBe('netflix');
  });

  it('returns no session id when nothing was captured', async () => {
    h.session.start('browser');
    await expect(h.session.stop()).resolves.toBeNull();
  });

  it('ends the session using the watched time, not counting pauses', async () => {
    h.session.start('browser');
    h.session.handleCaption(caption('I reckon so.'));
    const started = h.repos.sessions.list()[0]!.startedAt;
    h.clock.now += 10_000;
    h.session.togglePause();
    h.clock.now += 99_000;
    h.session.togglePause();
    const id = await h.session.stop();
    expect(h.repos.sessions.byId(id!)?.endedAt).toBe(started + 10_000);
    expect(h.session.status().state).toBe('idle');
  });

  it('asks for captions when none arrive for 20 seconds', () => {
    h.session.start('browser');
    h.clock.now += 19_000;
    expect(h.session.status().notice).toBeNull();
    h.clock.now += 1_000;
    expect(h.session.status().notice).toBe('no_captions');
  });

  it('clears the caption notice when one arrives', () => {
    h.session.start('browser');
    h.clock.now += 30_000;
    h.session.handleCaption(caption('Hello there.'));
    expect(h.session.status().notice).toBeNull();
  });

  it('tolerates a long silence after captions started', () => {
    h.session.start('browser');
    h.session.handleCaption(caption('Hello there.'));
    h.clock.now += 100_000;
    expect(h.session.status().notice).toBeNull();
    h.clock.now += 30_000;
    expect(h.session.status().notice).toBe('no_captions');
  });
});

describe('cards', () => {
  beforeEach(() => h.session.start('browser'));

  it('shows a word before its translation arrives', () => {
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.events.cards[0]).toMatchObject({
      lemma: 'reckon',
      pos: 'verb',
      translation: null,
      cefr: 'B2',
      sentence: 'I reckon so.',
      surface: 'reckon',
      count: 1,
    });
  });

  it('fills the card when the translation arrives and stores the sense', async () => {
    h.session.handleCaption(caption('I reckon so.'));
    await settle();
    expect(h.events.updates.at(-1)).toMatchObject({
      lemma: 'reckon',
      translation: 'tradução de reckon',
      explanation: 'explicação de reckon',
      extraExample: 'Example of reckon.',
    });
    expect(h.repos.senses.findByLemmaPos('reckon', 'verb')).toMatchObject({ provider: 'gemini' });
  });

  it('does not call the AI for a cached word', async () => {
    h.session.handleCaption(caption('I reckon so.'));
    await settle();
    await h.session.stop();

    h.session.start('browser');
    h.session.handleCaption(caption('I reckon again.'));
    await settle();
    expect(h.provider?.enrichWords).toHaveBeenCalledTimes(1);
    expect(h.events.cards.at(-1)).toMatchObject({
      lemma: 'reckon',
      translation: 'tradução de reckon',
    });
  });

  it('does not repeat a card for a word already shown', () => {
    h.session.handleCaption(caption('I reckon so.'));
    h.session.handleCaption(caption('I reckon again.'));
    expect(h.events.cards).toHaveLength(1);
  });

  it('updates the count when a word comes back', () => {
    h.session.handleCaption(caption('I reckon so.'));
    h.session.handleCaption(caption('I reckon again.'));
    expect(h.events.updates.at(-1)).toMatchObject({ lemma: 'reckon', count: 2 });
  });

  it('keeps counts made before the translation arrived', async () => {
    h.session.handleCaption(caption('I reckon so.'));
    h.session.handleCaption(caption('I reckon again.'));
    await settle();
    const id = h.repos.sessions.list()[0]!.id;
    expect(h.repos.sessionWords.listForSession(id)[0]).toMatchObject({
      count: 2,
      contextSentence: 'I reckon so.',
    });
  });

  it('counts new words in the status', () => {
    h.session.handleCaption(caption('I reckon he is wary.'));
    expect(h.session.status().newWords).toBe(1);
    h.clock.now += 15_000;
    h.session.tick();
    expect(h.session.status().newWords).toBe(2);
  });

  it('respects the cards per minute setting', () => {
    h.settings.update({ cardsPerMinute: 1 });
    h.session.handleCaption(caption('I reckon so.'));
    h.clock.now += 10_000;
    h.session.handleCaption(caption('She is wary.'));
    h.session.tick();
    expect(h.events.cards).toHaveLength(1);
  });

  it('spaces cards evenly inside the minute', () => {
    h.settings.update({ cardsPerMinute: 2 });
    h.session.handleCaption(caption('I reckon he is wary.'));
    h.session.tick();
    expect(h.events.cards).toHaveLength(1);
    h.clock.now += 30_000;
    h.session.handleCaption(caption('She is grumpy.'));
    expect(h.events.cards).toHaveLength(2);
  });

  it('forgets a waiting word after 30 seconds, because the moment passed', () => {
    h.settings.update({ cardsPerMinute: 1 });
    h.session.handleCaption(caption('I reckon so.'));
    h.clock.now += 1_000;
    h.session.handleCaption(caption('She is wary.'));
    h.clock.now += 60_000;
    h.session.tick();
    expect(h.events.cards).toHaveLength(1);
  });

  it('shows the highest score first when several words wait', () => {
    h.session.handleCaption(caption('I reckon he is wary.'));
    expect(h.events.cards[0]?.lemma).toBe('wary');
  });

  it('shows a phrasal verb with its label', () => {
    h.session.handleCaption(caption('We headed out.'));
    expect(h.events.cards[0]).toMatchObject({
      lemma: 'head out',
      pos: 'phrasal verb',
      surface: 'headed out',
    });
  });
});

describe('highlights', () => {
  beforeEach(() => h.session.start('browser'));

  it('underlines the word of the new card', () => {
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.events.highlights).toEqual([{ text: 'I reckon so.', surfaces: ['reckon'] }]);
  });

  it('underlines even when time passes while the caption is processed', () => {
    h.clock.step = 1;
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.events.highlights).toEqual([{ text: 'I reckon so.', surfaces: ['reckon'] }]);
  });

  it('does nothing when no card appears for the caption', () => {
    h.session.handleCaption(caption('Hello there.'));
    expect(h.events.highlights).toEqual([]);
  });

  it('respects the setting', () => {
    h.settings.update({ highlightSubtitles: false });
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.events.highlights).toEqual([]);
  });
});

describe('known and saved words', () => {
  beforeEach(() => h.session.start('browser'));

  it('removes the card of a word marked as known', () => {
    h.session.handleCaption(caption('I reckon so.'));
    h.vocabulary.markKnown('reckon');
    expect(h.events.removed).toEqual(['reckon']);
  });

  it('skips a known word from then on', () => {
    h.session.handleCaption(caption('I reckon so.'));
    h.vocabulary.markKnown('reckon');
    h.session.handleCaption(caption('I reckon again.'));
    expect(h.events.cards).toHaveLength(1);
    expect(h.events.updates).toEqual([]);
  });

  it('remembers known words across sessions', async () => {
    h.vocabulary.markKnown('reckon');
    await h.session.stop();
    h.session.start('browser');
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.events.cards).toEqual([]);
  });

  it('marks the most recent card as known', () => {
    h.session.handleCaption(caption('I reckon so.'));
    h.clock.now += 15_000;
    h.session.handleCaption(caption('She is wary.'));
    h.vocabulary.markCurrentKnown();
    expect(h.events.removed).toEqual(['wary']);
  });

  it('toggles a saved word', async () => {
    h.session.handleCaption(caption('I reckon so.'));
    await settle();
    expect(h.vocabulary.toggleSaved('reckon')).toBe(true);
    expect(h.events.updates.at(-1)?.saved).toBe(true);
    expect(h.vocabulary.toggleSaved('reckon')).toBe(false);
  });

  it('applies a save made before the translation arrives', async () => {
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.vocabulary.toggleSaved('reckon')).toBe(true);
    await settle();
    const sense = h.repos.senses.findByLemmaPos('reckon', 'verb')!;
    expect(h.repos.saved.isSaved(sense.id)).toBe(true);
  });
});

describe('AI failures', () => {
  function failing(online: { value: boolean }) {
    return fakeProvider({
      enrichWords: vi.fn(async (batch: EnrichRequestWord[]): Promise<EnrichedWord[]> => {
        if (!online.value) throw new Error('offline');
        return batch.map(enriched);
      }),
    });
  }

  it('shows a notice with the number of words waiting', async () => {
    h.close();
    h = createHarness({ provider: failing({ value: false }) });
    h.session.start('browser');
    h.session.handleCaption(caption('I reckon so.'));
    await settle();
    expect(h.session.status()).toMatchObject({ notice: 'ai_error', queuedWords: 1 });
  });

  it('clears the notice after recovering', async () => {
    const online = { value: false };
    h.close();
    h = createHarness({ provider: failing(online) });
    h.session.start('browser');
    h.session.handleCaption(caption('I reckon so.'));
    await settle();
    online.value = true;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.session.status()).toMatchObject({ notice: null, queuedWords: 0 });
  });

  it('shows the notice when there is no API key', async () => {
    h.close();
    h = createHarness({ provider: null });
    h.session.start('browser');
    h.session.handleCaption(caption('I reckon so.'));
    await settle();
    expect(h.session.status().notice).toBe('ai_error');
  });

  it('stops without hanging when the AI is down', async () => {
    h.close();
    h = createHarness({ provider: failing({ value: false }) });
    h.session.start('browser');
    h.session.handleCaption(caption('I reckon so.'));
    await expect(h.session.stop()).resolves.toEqual(expect.any(Number));
  });
});
