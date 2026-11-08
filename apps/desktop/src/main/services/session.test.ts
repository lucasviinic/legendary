import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionEvent, EnrichRequestWord, EnrichedWord } from '@legendary/contracts';
import type { OnTranslation } from '../ai/types';
import { createHarness, enriched, fakeProvider } from '../test/harness';

type Harness = ReturnType<typeof createHarness>;
let h: Harness;

const caption = (text: string, mediaTitle = 'Northbound · T1E3'): CaptionEvent => ({
  text,
  startedAt: 1,
  source: 'netflix',
  mediaTitle,
});

/** A palavra de um card vai para a IA na hora, então basta o relógio andar um instante. */
const settle = async () => {
  await vi.advanceTimersByTimeAsync(1);
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

  it('counts a word that comes back in another sentence, without translating it again', async () => {
    h.session.handleCaption(caption('I reckon so.'));
    await settle();
    h.session.handleCaption(caption('I reckon again.'));
    await settle();
    expect(h.provider?.enrichWords).toHaveBeenCalledTimes(1);
    expect(h.events.cards).toHaveLength(1);
    expect(h.events.updates.at(-1)).toMatchObject({
      lemma: 'reckon',
      count: 2,
      translation: 'tradução de reckon',
    });
    const id = h.repos.sessions.list()[0]!.id;
    expect(h.repos.sessionWords.listForSession(id)[0]?.count).toBe(2);
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

  it('shows a new card every 4 seconds at the fastest setting', () => {
    h.settings.update({ cardsPerMinute: 15, cardSeconds: 4 });
    h.session.handleCaption(caption('I reckon he is wary.'));
    expect(h.events.cards).toHaveLength(1);
    h.clock.now += 3_999;
    h.session.tick();
    expect(h.events.cards).toHaveLength(1);
    h.clock.now += 1;
    h.session.tick();
    expect(h.events.cards).toHaveLength(2);
  });

  it('keeps the next card out until the time of the current one ends', () => {
    h.settings.update({ cardsPerMinute: 10, cardSeconds: 15 });
    h.session.handleCaption(caption('I reckon he is wary.'));
    h.clock.now += 14_999;
    h.session.tick();
    expect(h.events.cards).toHaveLength(1);
    h.clock.now += 1;
    h.session.tick();
    expect(h.events.cards).toHaveLength(2);
  });

  it('counts the time of the card from when its explanation arrives', async () => {
    h.close();
    const finish: (() => void)[] = [];
    const provider = fakeProvider({
      enrichWords: vi.fn(
        (batch: EnrichRequestWord[]) =>
          new Promise<EnrichedWord[]>((resolve) => {
            finish.push(() => resolve(batch.map(enriched)));
          }),
      ),
    });
    h = createHarness({ provider, settings: { cardsPerMinute: 10, cardSeconds: 6 } });
    h.session.start('browser');
    h.session.handleCaption(caption('I reckon he is wary.'));
    await settle();
    h.clock.now += 5_000;
    finish[0]?.();
    await settle();

    h.clock.now += 5_999;
    h.session.tick();
    expect(h.events.cards).toHaveLength(1);
    h.clock.now += 1;
    h.session.tick();
    expect(h.events.cards).toHaveLength(2);
  });

  it('frees the place of a card marked as known', () => {
    h.settings.update({ cardsPerMinute: 10, cardSeconds: 30 });
    h.session.handleCaption(caption('I reckon he is wary.'));
    h.vocabulary.markKnown('wary');
    h.clock.now += 6_000;
    h.session.tick();
    expect(h.events.cards.at(-1)?.lemma).toBe('reckon');
  });

  describe('with more than one card at a time', () => {
    beforeEach(() => h.settings.update({ cardsAtOnce: 2, cardsPerMinute: 10, cardSeconds: 10 }));

    it('shows as many cards together as the setting allows', () => {
      h.session.handleCaption(caption('The grumpy wary man had a hunch.'));
      expect(h.events.cards.map((card) => card.lemma)).toEqual(['hunch', 'wary']);
    });

    it('underlines every word that got a card, in one message', () => {
      h.session.handleCaption(caption('I reckon he is wary.'));
      expect(h.events.highlights).toEqual([
        { text: 'I reckon he is wary.', surfaces: ['wary', 'reckon'] },
      ]);
    });

    it('waits for a place to open', () => {
      h.settings.update({ cardsPerMinute: 10, cardSeconds: 20 });
      h.session.handleCaption(caption('The grumpy wary man had a hunch.'));
      h.clock.now += 19_999;
      h.session.tick();
      expect(h.events.cards).toHaveLength(2);
      h.clock.now += 1;
      h.session.tick();
      expect(h.events.cards.at(-1)?.lemma).toBe('grumpy');
    });

    it('still respects the cards per minute', () => {
      h.session.handleCaption(caption('The grumpy wary man had a hunch.'));
      h.clock.now += 11_999;
      h.session.tick();
      expect(h.events.cards).toHaveLength(2);
      h.clock.now += 1;
      h.session.tick();
      expect(h.events.cards).toHaveLength(3);
    });

    it('translates ahead more words, because they are used faster', async () => {
      h.session.handleCaption(caption('The grumpy wary man had a hunch and a knack, I reckon.'));
      await vi.advanceTimersByTimeAsync(2_000);
      const asked = vi
        .mocked(h.provider!.enrichWords)
        .mock.calls.flatMap(([batch]) => batch.map((word) => word.lemma));
      expect(asked.sort()).toEqual(['grumpy', 'hunch', 'knack', 'reckon', 'wary']);
    });
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

describe('searching a word', () => {
  beforeEach(() => h.session.start('browser'));

  const lastLemma = () => h.events.cards.at(-1)?.lemma;

  it('shows the card right away, even out of the per minute limit', () => {
    h.settings.update({ cardsPerMinute: 1 });
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.session.search('knack')).toBe(true);
    expect(h.events.cards.at(-1)).toMatchObject({ lemma: 'knack', translation: null, count: 1 });
    expect(h.session.status().newWords).toBe(2);
  });

  it('asks the AI for the translation at once', async () => {
    h.session.search('knack');
    await settle();
    expect(h.events.updates.at(-1)).toMatchObject({
      lemma: 'knack',
      translation: 'tradução de knack',
    });
  });

  it('uses the cached translation without calling the AI', async () => {
    h.session.search('knack');
    await settle();
    await h.session.stop();
    h.session.start('browser');
    h.session.search('knack');
    await settle();
    expect(h.provider?.enrichWords).toHaveBeenCalledTimes(1);
    expect(h.events.cards.at(-1)).toMatchObject({ translation: 'tradução de knack' });
  });

  it('accepts a word the captions would filter out as too common', () => {
    h.session.handleCaption(caption('The house is here.'));
    expect(h.events.cards).toEqual([]);
    h.session.search('house');
    expect(h.events.cards[0]).toMatchObject({ lemma: 'house', sentence: 'The house is here.' });
  });

  it('accepts a word marked as known, and keeps it known', () => {
    h.vocabulary.markKnown('reckon');
    h.session.search('reckon');
    expect(lastLemma()).toBe('reckon');
    expect(h.repos.known.all().has('reckon')).toBe(true);
  });

  it('underlines the word in the caption where it appeared', () => {
    h.session.handleCaption(caption('The house is here.'));
    h.session.search('houses');
    expect(h.events.cards[0]).toMatchObject({ surface: 'house', sentence: 'The house is here.' });
  });

  it('sends the word and the caption where it appeared to the AI', async () => {
    h.session.handleCaption(caption('The house is here.'));
    h.session.search('houses');
    await settle();
    expect(vi.mocked(h.provider!.enrichWords).mock.calls.at(-1)?.[0]).toEqual([
      { lemma: 'house', pos: 'noun', surface: 'house', sentence: 'The house is here.' },
    ]);
  });

  it('shows the example from the AI when no caption has the word', async () => {
    h.session.search('knack');
    expect(h.events.cards[0]?.sentence).toBe('');
    await settle();
    expect(h.events.updates.at(-1)).toMatchObject({
      sentence: 'Example of knack.',
      extraExample: null,
    });
  });

  it('brings back a word already on the stack instead of counting it twice', () => {
    h.session.handleCaption(caption('I reckon so.'));
    h.clock.now += 15_000;
    h.session.handleCaption(caption('She is wary.'));
    h.session.search('reckon');
    expect(lastLemma()).toBe('reckon');
    expect(h.events.cards).toHaveLength(3);
    expect(h.session.status().newWords).toBe(2);

    h.vocabulary.markCurrentKnown();
    expect(h.events.removed).toEqual(['reckon']);
  });

  it('shows at once a word that was waiting its turn, and only once', () => {
    h.session.handleCaption(caption('I reckon he is wary.'));
    expect(lastLemma()).toBe('wary');
    h.session.search('reckon');
    expect(lastLemma()).toBe('reckon');
    h.clock.now += 60_000;
    h.session.tick();
    expect(h.events.cards).toHaveLength(2);
  });

  it('counts a searched word each time it appears, even one the captions filter out', async () => {
    h.session.handleCaption(caption('The house is here.'));
    h.session.search('house');
    await settle();
    h.session.handleCaption(caption('What a house.'));
    expect(h.events.updates.at(-1)).toMatchObject({ lemma: 'house', count: 2 });
    h.session.handleCaption(caption('Hello there.'));
    h.session.handleCaption(caption('Our house is old.'));
    expect(h.events.updates.at(-1)).toMatchObject({ lemma: 'house', count: 3 });

    const id = h.repos.sessions.list()[0]!.id;
    const sense = h.repos.senses.findByLemmaPos('house', 'noun')!;
    expect(h.repos.sessionWords.forSense(id, sense.id)?.count).toBe(3);
  });

  it('counts a searched word marked as known when it appears', () => {
    h.vocabulary.markKnown('reckon');
    h.session.handleCaption(caption('I reckon so.'));
    h.session.search('reckon');
    h.session.handleCaption(caption('I reckon again.'));
    expect(h.events.updates.at(-1)).toMatchObject({ lemma: 'reckon', count: 2 });
  });

  it('counts only once a searched word the captions also let through', () => {
    h.session.handleCaption(caption('I reckon so.'));
    h.session.search('reckon');
    h.session.handleCaption(caption('I reckon again.'));
    expect(h.events.updates.at(-1)).toMatchObject({ lemma: 'reckon', count: 2 });
  });

  it('does not translate again when the caption gives the word another class', async () => {
    // Sozinha, "hunch" parece substantivo. Nesta legenda, é verbo.
    h.session.search('hunch');
    await settle();
    expect(h.events.cards[0]?.pos).toBe('noun');

    h.session.handleCaption(caption('They hunch over the table.'));
    // Tempo para a palavra chegar à vez dela e para a fila antecipar a tradução.
    await vi.advanceTimersByTimeAsync(2_000);
    h.clock.now += 60_000;
    h.session.tick();
    await settle();
    expect(h.provider?.enrichWords).toHaveBeenCalledTimes(1);
    expect(h.events.cards).toHaveLength(1);
    expect(h.session.status().newWords).toBe(1);
  });

  it('takes the first caption with the word as its first appearance', async () => {
    h.session.search('knack');
    await settle();
    expect(h.events.updates.at(-1)).toMatchObject({ count: 1, sentence: 'Example of knack.' });

    h.session.handleCaption(caption('She has a knack for it.'));
    expect(h.events.updates.at(-1)).toMatchObject({
      count: 1,
      sentence: 'She has a knack for it.',
      extraExample: 'Example of knack.',
    });
    h.session.handleCaption(caption('What a knack.'));
    expect(h.events.updates.at(-1)).toMatchObject({ count: 2 });
  });

  it('does not count a searched word in a caption without it', () => {
    h.session.search('knack');
    const updates = h.events.updates.length;
    h.session.handleCaption(caption('Hello there.'));
    expect(h.events.updates).toHaveLength(updates);
  });

  it('makes the next card wait the usual interval', () => {
    h.settings.update({ cardsPerMinute: 2 });
    h.clock.now += 60_000;
    h.session.search('knack');
    h.session.handleCaption(caption('I reckon so.'));
    expect(h.events.cards).toHaveLength(1);
    h.clock.now += 30_000;
    h.session.tick();
    expect(lastLemma()).toBe('reckon');
  });

  it('works while paused, but not without a session', async () => {
    h.session.togglePause();
    expect(h.session.search('knack')).toBe(true);
    await h.session.stop();
    expect(h.session.search('hunch')).toBe(false);
    expect(lastLemma()).toBe('knack');
  });

  it('refuses a text without letters', () => {
    expect(h.session.search('123')).toBe(false);
    expect(h.events.cards).toEqual([]);
  });

  it('enters the session and uses the example from the AI as the context of the quiz', async () => {
    h.session.handleCaption(caption('I reckon so.'));
    h.session.search('knack');
    await settle();
    const id = h.repos.sessions.list()[0]!.id;
    const sense = h.repos.senses.findByLemmaPos('knack', 'noun')!;
    expect(h.repos.sessionWords.forSense(id, sense.id)).toMatchObject({
      contextSentence: 'Example of knack.',
    });
  });

  it('keeps a word searched before the first caption, which is what creates the session', async () => {
    h.session.search('knack');
    await settle();
    expect(h.repos.sessions.list()).toEqual([]);
    h.session.handleCaption(caption('Hello there.'));
    const id = h.repos.sessions.list()[0]!.id;
    const sense = h.repos.senses.findByLemmaPos('knack', 'noun')!;
    expect(h.repos.sessionWords.forSense(id, sense.id)).toBeDefined();
  });
});

describe('translating every word', () => {
  beforeEach(() => {
    h.settings.update({ translateAllWords: true });
    h.session.start('browser');
  });

  const asked = () =>
    vi
      .mocked(h.provider!.enrichWords)
      .mock.calls.flatMap(([batch]) => batch.map((word) => word.lemma));

  it('shows a card for a word below the level', () => {
    h.session.handleCaption(caption('The house is here.'));
    expect(h.events.cards[0]?.lemma).toBe('house');
  });

  it('shows a word that comes back only as a summary, without translating it again', async () => {
    h.session.handleCaption(caption('The house is here.'));
    await settle();
    h.session.handleCaption(caption('What a house.'));
    await settle();
    expect(h.events.seen.at(-1)).toMatchObject({
      lemma: 'house',
      count: 2,
      translation: 'tradução de house',
    });
    expect(h.events.cards).toHaveLength(1);
    expect(asked()).toEqual(['house']);
  });

  it('does not translate again when the same word comes back with another class', async () => {
    // "hunch" é substantivo na primeira frase e verbo na segunda.
    h.session.handleCaption(caption('He had a hunch.'));
    await settle();
    h.session.handleCaption(caption('They hunch over it.'));
    await settle();
    expect(asked()).toEqual(['hunch']);
    expect(h.events.cards.map((card) => card.lemma)).toEqual(['hunch']);
    expect(h.events.seen.at(-1)).toMatchObject({
      lemma: 'hunch',
      pos: 'noun',
      count: 2,
      translation: 'tradução de hunch',
    });
  });

  it('uses a translation from another session even with another class', async () => {
    h.session.handleCaption(caption('He had a hunch.'));
    await settle();
    await h.session.stop();
    h.session.start('browser');
    h.events.cards.length = 0;

    h.session.handleCaption(caption('They hunch over it.'));
    await settle();
    expect(asked()).toEqual(['hunch']);
    expect(h.events.cards).toEqual([]);
    expect(h.events.seen.at(-1)).toMatchObject({
      lemma: 'hunch',
      translation: 'tradução de hunch',
    });
  });

  it('counts each time a word comes back', () => {
    h.session.handleCaption(caption('The house is here.'));
    h.session.handleCaption(caption('What a house.'));
    h.session.handleCaption(caption('Our house is old.'));
    expect(h.events.seen.at(-1)).toMatchObject({ lemma: 'house', count: 3 });
  });

  it('shows only a summary for a word translated in another session', async () => {
    h.session.handleCaption(caption('The house is here.'));
    await settle();
    await h.session.stop();
    h.session.start('browser');
    h.events.cards.length = 0;

    h.session.handleCaption(caption('The house is here.'));
    await settle();
    expect(h.events.cards).toEqual([]);
    expect(h.events.seen.at(-1)).toMatchObject({
      lemma: 'house',
      translation: 'tradução de house',
    });
    expect(asked()).toEqual(['house']);

    const id = h.repos.sessions.list()[0]!.id;
    const sense = h.repos.senses.findByLemmaPos('house', 'noun')!;
    expect(h.repos.sessionWords.forSense(id, sense.id)).toBeDefined();
  });

  it('turns a word into a summary when it waited too long, instead of losing it', async () => {
    h.settings.update({ cardSeconds: 30, cardsPerMinute: 1 });
    h.session.handleCaption(caption('The grumpy man has a house.'));
    expect(h.events.cards.map((card) => card.lemma)).toEqual(['man']);

    h.clock.now += 9_999;
    h.session.tick();
    expect(h.events.seen).toEqual([]);

    h.clock.now += 2;
    h.session.tick();
    await settle();
    expect(h.events.seen.map((card) => card.lemma).sort()).toEqual(['grumpy', 'house']);
    expect(h.events.cards).toHaveLength(1);
    expect(asked()).toEqual(expect.arrayContaining(['grumpy', 'house']));
  });

  it('translates ahead every word that waits', async () => {
    h.settings.update({ cardSeconds: 30, cardsPerMinute: 1 });
    h.session.handleCaption(caption('A grumpy and wary man had a hunch and a knack, I reckon.'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(asked().sort()).toEqual(['grumpy', 'hunch', 'knack', 'man', 'reckon', 'wary']);
  });

  it('keeps the shortcut for a known word on the card that is open', () => {
    h.settings.update({ cardSeconds: 30, cardsPerMinute: 1 });
    h.session.handleCaption(caption('The house is here.'));
    h.clock.now += 1_000;
    h.session.handleCaption(caption('What a grumpy man.'));
    h.clock.now += 10_001;
    h.session.tick();
    expect(h.events.seen.length).toBeGreaterThan(0);

    h.vocabulary.markCurrentKnown();
    expect(h.events.removed).toEqual(['house']);
  });

  it('counts every word shown in the status', () => {
    h.settings.update({ cardSeconds: 30, cardsPerMinute: 1 });
    h.session.handleCaption(caption('The grumpy man has a house.'));
    h.clock.now += 10_001;
    h.session.tick();
    expect(h.session.status().newWords).toBe(3);
  });

  it('skips a word marked as known', () => {
    h.vocabulary.markKnown('house');
    h.session.handleCaption(caption('The house is here.'));
    expect(h.events.cards).toEqual([]);
    expect(h.events.seen).toEqual([]);
  });

  it('shows a searched word that comes back as a summary too', () => {
    h.session.search('knack');
    h.session.handleCaption(caption('She has a knack for it.'));
    h.session.handleCaption(caption('What a knack.'));
    expect(h.events.seen.at(-1)).toMatchObject({ lemma: 'knack', count: 2 });
  });

  it('only counts a searched word marked as known when it comes back', () => {
    h.vocabulary.markKnown('knack');
    h.session.search('knack');
    h.session.handleCaption(caption('She has a knack for it.'));
    h.session.handleCaption(caption('What a knack.'));
    expect(h.events.seen.map(({ lemma }) => lemma)).not.toContain('knack');
    expect(h.events.updates.at(-1)).toMatchObject({ lemma: 'knack', count: 2 });
  });

  it('brings back a searched word once it is unmarked', () => {
    h.vocabulary.markKnown('knack');
    h.session.search('knack');
    h.vocabulary.unmarkKnown('knack');
    h.session.handleCaption(caption('What a knack.'));
    expect(h.events.seen.at(-1)).toMatchObject({ lemma: 'knack', known: false });
  });
});

describe('translating only the words of the level', () => {
  beforeEach(() => h.session.start('browser'));

  it('does not bring back a word that returns', () => {
    h.session.handleCaption(caption('I reckon so.'));
    h.session.handleCaption(caption('I reckon again.'));
    expect(h.events.seen).toEqual([]);
    expect(h.events.updates.at(-1)).toMatchObject({ lemma: 'reckon', count: 2 });
  });

  it('forgets a word that waited too long', () => {
    h.settings.update({ cardsPerMinute: 1 });
    h.session.handleCaption(caption('I reckon he is wary.'));
    h.clock.now += 30_001;
    h.session.tick();
    expect(h.events.seen).toEqual([]);
  });
});

describe('translating ahead', () => {
  beforeEach(() => h.session.start('browser'));

  const askedLemmas = () =>
    vi
      .mocked(h.provider!.enrichWords)
      .mock.calls.flatMap(([batch]) => batch.map((word) => word.lemma));

  const cacheSense = (lemma: string) =>
    h.repos.senses.insert({
      lemma,
      pos: lemma === 'wary' ? 'adj' : 'verb',
      translation: `cache de ${lemma}`,
      explanation: 'e',
      exampleEn: 'x',
      examplePt: 'y',
      cefr: 'B2',
      provider: 'gemini',
    });

  it('makes the card of a waiting word arrive with its translation', async () => {
    h.session.handleCaption(caption('I reckon he is wary.'));
    await settle();
    h.clock.now += 15_000;
    h.session.tick();
    expect(h.events.cards.at(-1)).toMatchObject({
      lemma: 'reckon',
      translation: 'tradução de reckon',
      explanation: 'explicação de reckon',
    });
    expect(h.provider?.enrichWords).toHaveBeenCalledTimes(1);
  });

  it('keeps the word out of the session until its card appears', async () => {
    h.session.handleCaption(caption('I reckon he is wary.'));
    await settle();
    const id = h.repos.sessions.list()[0]!.id;
    const reckon = h.repos.senses.findByLemmaPos('reckon', 'verb')!;
    const senseIds = () => h.repos.sessionWords.listForSession(id).map((word) => word.senseId);
    expect(senseIds()).not.toContain(reckon.id);

    h.clock.now += 15_000;
    h.session.tick();
    expect(senseIds()).toContain(reckon.id);
  });

  it('picks a word already translated for the next card, ahead of a better one that is not', async () => {
    h.session.handleCaption(caption('I reckon he is wary.'));
    await vi.advanceTimersByTimeAsync(2_000);
    h.clock.now += 15_000;
    // "knack" tem pontuação maior que "reckon", mas ainda não foi traduzida.
    h.session.handleCaption(caption('She has a knack for it.'));
    expect(h.events.cards.at(-1)).toMatchObject({
      lemma: 'reckon',
      translation: 'tradução de reckon',
    });

    h.clock.now += 15_000;
    h.session.tick();
    expect(h.events.cards.at(-1)?.lemma).toBe('knack');
  });

  it('asks only for the three best words waiting', async () => {
    h.session.handleCaption(caption('The grumpy wary man had a hunch and a knack, I reckon.'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.events.cards[0]?.lemma).toBe('knack');
    expect(askedLemmas()).toHaveLength(4);
    expect(askedLemmas()).not.toContain('reckon');
  });

  it('does not ask again for a word already requested', async () => {
    h.session.handleCaption(caption('I reckon he is wary.'));
    await settle();
    h.clock.now += 1_000;
    h.session.tick();
    h.session.handleCaption(caption('I reckon so.'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(askedLemmas().sort()).toEqual(['reckon', 'wary']);
  });

  it('does not ask for a word already cached', async () => {
    cacheSense('reckon');
    h.session.handleCaption(caption('I reckon he is wary.'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(askedLemmas()).toEqual(['wary']);
  });

  it('does not ask again, on each tick, for a word whose request failed', async () => {
    h.close();
    const provider = fakeProvider({
      enrichWords: vi.fn(async (): Promise<EnrichedWord[]> => {
        throw new Error('offline');
      }),
    });
    h = createHarness({ provider, settings: { cardsPerMinute: 1 } });
    cacheSense('wary');
    h.session.start('browser');
    h.session.handleCaption(caption('I reckon he is wary.'));
    await vi.advanceTimersByTimeAsync(400);
    expect(provider.enrichWords).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 20; i++) {
      h.clock.now += 1_000;
      h.session.tick();
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(provider.enrichWords).toHaveBeenCalledTimes(1);
    expect(h.session.status().notice).toBeNull();
  });

  it('still shows the card of a word whose early request failed, and asks again', async () => {
    h.close();
    let online = false;
    const provider = fakeProvider({
      enrichWords: vi.fn(async (batch: EnrichRequestWord[]) => {
        if (!online) throw new Error('offline');
        return batch.map(enriched);
      }),
    });
    h = createHarness({ provider });
    cacheSense('wary');
    h.session.start('browser');
    h.session.handleCaption(caption('I reckon he is wary.'));
    await vi.advanceTimersByTimeAsync(1_500);

    online = true;
    h.clock.now += 15_000;
    h.session.tick();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.events.cards.at(-1)).toMatchObject({ lemma: 'reckon', translation: null });
    expect(h.events.updates.at(-1)).toMatchObject({
      lemma: 'reckon',
      translation: 'tradução de reckon',
    });
  });
});

describe('translation arriving first', () => {
  function streaming() {
    const finish: (() => void)[] = [];
    const provider = fakeProvider({
      enrichWords: vi.fn(
        (batch: EnrichRequestWord[], onTranslation?: OnTranslation) =>
          new Promise<EnrichedWord[]>((resolve) => {
            batch.forEach((word) => onTranslation?.(word, `primeiro ${word.lemma}`));
            finish.push(() => resolve(batch.map(enriched)));
          }),
      ),
    });
    h.close();
    h = createHarness({ provider });
    h.session.start('browser');
    return finish;
  }

  it('fills the translation of the card before the rest', async () => {
    const finish = streaming();
    h.session.handleCaption(caption('I reckon so.'));
    await settle();
    expect(h.events.updates.at(-1)).toMatchObject({
      lemma: 'reckon',
      translation: 'primeiro reckon',
      explanation: null,
    });

    finish[0]?.();
    await settle();
    expect(h.events.updates.at(-1)).toMatchObject({
      lemma: 'reckon',
      translation: 'tradução de reckon',
      explanation: 'explicação de reckon',
    });
  });

  it('saves nothing before the answer is complete', async () => {
    streaming();
    h.session.handleCaption(caption('I reckon so.'));
    await settle();
    expect(h.repos.senses.findByLemmaPos('reckon', 'verb')).toBeUndefined();
  });

  it('does not touch the screen for a word that is not a card yet', async () => {
    streaming();
    h.session.handleCaption(caption('I reckon he is wary.'));
    await settle();
    expect(h.events.updates.map((card) => card.lemma)).not.toContain('reckon');
  });

  it('shows the translation that already arrived when the card appears', async () => {
    streaming();
    h.session.handleCaption(caption('I reckon he is wary.'));
    await settle();
    h.clock.now += 15_000;
    h.session.tick();
    expect(h.events.cards.at(-1)).toMatchObject({
      lemma: 'reckon',
      translation: 'primeiro reckon',
      explanation: null,
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

  describe('searching a word marked as known', () => {
    beforeEach(() => h.vocabulary.markKnown('reckon'));

    it('marks the card', () => {
      h.session.search('reckon');
      expect(h.events.cards.at(-1)).toMatchObject({ lemma: 'reckon', known: true });
    });

    it('marks the card in a later session too', async () => {
      await h.session.stop();
      h.session.start('browser');
      h.session.search('reckon');
      expect(h.events.cards.at(-1)).toMatchObject({ lemma: 'reckon', known: true });
    });

    it('does not count it as a new word', () => {
      h.session.search('reckon');
      expect(h.session.status().newWords).toBe(0);
    });

    it('does not offer a quiz when it is the only word of the session', async () => {
      h.session.handleCaption(caption('I reckon so.'));
      h.session.search('reckon');
      await expect(h.session.stop()).resolves.toBeNull();
    });

    it('keeps the card and the mark when the shortcut is pressed', () => {
      h.session.search('reckon');
      h.events.removed.length = 0;
      h.vocabulary.markCurrentKnown();
      expect(h.events.removed).toEqual([]);
      expect(h.repos.known.all().has('reckon')).toBe(true);
    });

    describe('and unmarking it', () => {
      beforeEach(() => {
        h.session.search('reckon');
        h.events.removed.length = 0;
        h.vocabulary.unmarkKnown('reckon');
      });

      it('keeps the card open, without the mark', () => {
        expect(h.events.updates.at(-1)).toMatchObject({ lemma: 'reckon', known: false });
        expect(h.events.removed).toEqual([]);
      });

      it('counts it as a new word', () => {
        expect(h.session.status().newWords).toBe(1);
      });

      it('lets captions bring it back in the next session', async () => {
        await h.session.stop();
        h.session.start('browser');
        h.session.handleCaption(caption('I reckon so.'));
        expect(h.events.cards.at(-1)).toMatchObject({ lemma: 'reckon', known: false });
      });

      it('closes the card when it is marked again', () => {
        h.vocabulary.markKnown('reckon');
        expect(h.events.removed).toEqual(['reckon']);
        expect(h.session.status().newWords).toBe(0);
      });
    });
  });

  it('does not mark the card of a searched word that is not known', () => {
    h.session.search('reckon');
    expect(h.events.cards.at(-1)).toMatchObject({ lemma: 'reckon', known: false });
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
