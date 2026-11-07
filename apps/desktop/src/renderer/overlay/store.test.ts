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
