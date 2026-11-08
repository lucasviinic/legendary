import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WordCard } from '@legendary/contracts';
import { useOverlay } from './store';

const card = (lemma: string, overrides: Partial<WordCard> = {}): WordCard => ({
  lemma,
  surface: lemma,
  pos: 'verb',
  cefr: 'B2',
  translation: `t-${lemma}`,
  explanation: `e-${lemma}`,
  sentence: `I ${lemma}.`,
  extraExample: null,
  count: 1,
  saved: false,
  known: false,
  ...overrides,
});

const state = () => useOverlay.getState();
const lemmas = () => state().items.map((item) => item.card.lemma);
const isFocused = (lemma: string) =>
  state().items.find((item) => item.card.lemma === lemma)?.focused;

const after = (ms: number) => {
  vi.advanceTimersByTime(ms);
  state().expireCards();
};

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

beforeEach(() => {
  vi.useFakeTimers();
  useOverlay.setState(useOverlay.getInitialState(), true);
});

afterEach(() => vi.useRealTimers());

describe('overlay cards', () => {
  it('keeps the current card and up to six summaries, newest first', () => {
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach((lemma) => state().addCard(card(lemma)));
    expect(lemmas()).toEqual(['h', 'g', 'f', 'e', 'd', 'c', 'b']);
  });

  it('keeps as many summaries as the settings allow', () => {
    state().setLayout({ ...state(), maxSummaries: 12 });
    'abcdefghijklmn'.split('').forEach((lemma) => state().addCard(card(lemma)));
    expect(lemmas()).toHaveLength(13);
    expect(lemmas()[0]).toBe('n');
  });

  it('drops the oldest summaries right away when the limit goes down', () => {
    'abcd'.split('').forEach((lemma) => state().addCard(card(lemma)));
    state().setLayout({ ...state(), maxSummaries: 1 });
    expect(lemmas()).toEqual(['d', 'c']);
  });

  describe('with more than one card at a time', () => {
    beforeEach(() => state().setLayout({ ...state(), cardsAtOnce: 2 }));

    it('keeps the newest cards open and shrinks the older ones', () => {
      ['a', 'b', 'c'].forEach((lemma) => state().addCard(card(lemma)));
      expect(lemmas()).toEqual(['c', 'b', 'a']);
      expect(['a', 'b', 'c'].map(isFocused)).toEqual([false, true, true]);
    });

    it('does not count the open cards among the summaries', () => {
      state().setLayout({ ...state(), maxSummaries: 1 });
      ['a', 'b', 'c', 'd'].forEach((lemma) => state().addCard(card(lemma)));
      expect(lemmas()).toEqual(['d', 'c', 'b']);
    });

    it('keeps the open cards on top when an older one stays open longer', () => {
      state().addCard(card('a', { translation: null, explanation: null }));
      after(5 * SECOND);
      state().addCard(card('b'));
      after(4 * SECOND);
      state().updateCard(card('a'));
      after(6 * SECOND);
      expect(isFocused('b')).toBe(false);
      expect(isFocused('a')).toBe(true);
      expect(lemmas()).toEqual(['a', 'b']);
    });
  });

  it('uses the time of a card from the settings', () => {
    state().setLayout({ ...state(), cardSeconds: 3 });
    state().addCard(card('a'));
    after(2 * SECOND);
    expect(isFocused('a')).toBe(true);
    after(1 * SECOND);
    expect(isFocused('a')).toBe(false);
  });

  describe('a word that comes back', () => {
    it('enters as a summary, below the open card', () => {
      state().addCard(card('a'));
      state().seenCard(card('b', { count: 2 }));
      expect(lemmas()).toEqual(['a', 'b']);
      expect(isFocused('a')).toBe(true);
      expect(isFocused('b')).toBe(false);
    });

    it('moves to the top of the summaries with its new count', () => {
      ['a', 'b', 'c'].forEach((lemma) => state().addCard(card(lemma)));
      state().seenCard(card('a', { count: 4 }));
      expect(lemmas()).toEqual(['c', 'a', 'b']);
      expect(state().items[1]?.card.count).toBe(4);
    });

    it('updates an open card without closing it', () => {
      state().addCard(card('a'));
      state().seenCard(card('a', { count: 2 }));
      expect(isFocused('a')).toBe(true);
      expect(state().items[0]?.card.count).toBe(2);
    });

    it('stays for 3 more minutes', () => {
      state().addCard(card('a'));
      after(2 * MINUTE);
      state().seenCard(card('a', { count: 2 }));
      after(2 * MINUTE);
      expect(lemmas()).toEqual(['a']);
    });

    it('respects the limit of summaries', () => {
      state().setLayout({ ...state(), maxSummaries: 2 });
      ['a', 'b', 'c'].forEach((lemma) => state().seenCard(card(lemma)));
      expect(lemmas()).toEqual(['c', 'b']);
    });

    it('waits while the mouse is over a card, so the card does not run away', () => {
      ['a', 'b'].forEach((lemma) => state().addCard(card(lemma)));
      state().setHovered('a');
      state().seenCard(card('c'));
      state().seenCard(card('d'));
      expect(lemmas()).toEqual(['b', 'a']);

      state().setHovered(null);
      expect(lemmas()).toEqual(['b', 'd', 'c', 'a']);
    });
  });

  it('gives the focus to the newest card only', () => {
    state().addCard(card('a'));
    state().addCard(card('b'));
    expect(isFocused('b')).toBe(true);
    expect(isFocused('a')).toBe(false);
  });

  it('shrinks the card after 10 seconds instead of removing it', () => {
    state().addCard(card('a'));
    after(9 * SECOND);
    expect(isFocused('a')).toBe(true);
    after(1 * SECOND);
    expect(isFocused('a')).toBe(false);
    expect(lemmas()).toEqual(['a']);
  });

  it('starts the 10 seconds again when the explanation arrives', () => {
    state().addCard(card('a', { translation: null, explanation: null }));
    after(8 * SECOND);
    state().updateCard(card('a', { explanation: null }));
    after(2 * SECOND);
    expect(isFocused('a')).toBe(false);

    state().addCard(card('b', { translation: null, explanation: null }));
    after(8 * SECOND);
    state().updateCard(card('b'));
    after(9 * SECOND);
    expect(isFocused('b')).toBe(true);
    after(1 * SECOND);
    expect(isFocused('b')).toBe(false);
  });

  it('keeps a summary for 3 minutes when no newer card pushes it out', () => {
    state().addCard(card('a'));
    after(3 * MINUTE - SECOND);
    expect(lemmas()).toEqual(['a']);
    after(SECOND);
    expect(lemmas()).toEqual([]);
  });

  it('does not count the minutes again when a translation arrives late', () => {
    state().addCard(card('a', { translation: null, explanation: null }));
    after(2 * MINUTE);
    state().updateCard(card('a'));
    after(MINUTE);
    expect(lemmas()).toEqual([]);
  });

  it('keeps the hovered card in focus and on the screen', () => {
    state().addCard(card('a'));
    state().setHovered('a');
    after(5 * MINUTE);
    expect(isFocused('a')).toBe(true);
    expect(lemmas()).toEqual(['a']);
    state().setHovered(null);
    after(0);
    expect(lemmas()).toEqual([]);
  });

  it('does not change the state when nothing expired', () => {
    state().addCard(card('a'));
    const before = state().items;
    after(SECOND);
    expect(state().items).toBe(before);
  });

  it('removes a card marked as known', () => {
    state().addCard(card('a'));
    state().removeCard('a');
    expect(lemmas()).toEqual([]);
  });

  it('clears everything when the session ends', () => {
    state().addCard(card('a'));
    state().setStatus({ ...state().status, state: 'idle' });
    expect(lemmas()).toEqual([]);
  });
});
