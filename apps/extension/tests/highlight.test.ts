import { beforeEach, describe, expect, it } from 'vitest';
import { applyHighlight, HIGHLIGHT_ATTRIBUTE } from '../lib/highlight';

const SELECTOR = '.caption';
const marks = () =>
  [...document.querySelectorAll(`[${HIGHLIGHT_ATTRIBUTE}]`)].map((mark) => mark.textContent);

beforeEach(() => {
  document.body.innerHTML = '<div class="caption"><span>I reckon we should head out.</span></div>';
});

describe('applyHighlight', () => {
  it('wraps the word in a span', () => {
    applyHighlight(document, SELECTOR, ['reckon']);
    expect(marks()).toEqual(['reckon']);
  });

  it('keeps the visible text intact', () => {
    applyHighlight(document, SELECTOR, ['reckon']);
    expect(document.querySelector(SELECTOR)?.textContent).toBe('I reckon we should head out.');
  });

  it('uses the accent color of the mockup', () => {
    applyHighlight(document, SELECTOR, ['reckon']);
    const mark = document.querySelector<HTMLElement>(`[${HIGHLIGHT_ATTRIBUTE}]`)!;
    expect(mark.style.textDecorationColor).toBe('rgb(127, 219, 202)');
    expect(mark.style.textDecorationLine).toBe('underline');
  });

  it('finds a phrase', () => {
    applyHighlight(document, SELECTOR, ['head out']);
    expect(marks()).toEqual(['head out']);
  });

  it('ignores case', () => {
    document.body.innerHTML = '<div class="caption">Reckon so.</div>';
    applyHighlight(document, SELECTOR, ['reckon']);
    expect(marks()).toEqual(['Reckon']);
  });

  it('does not match part of a longer word', () => {
    document.body.innerHTML = '<div class="caption">Reckoning day.</div>';
    applyHighlight(document, SELECTOR, ['reckon']);
    expect(marks()).toEqual([]);
  });

  it('does not wrap the same word twice', () => {
    applyHighlight(document, SELECTOR, ['reckon']);
    applyHighlight(document, SELECTOR, ['reckon']);
    expect(marks()).toEqual(['reckon']);
  });

  it('never treats caption text as HTML', () => {
    document.body.innerHTML = '<div class="caption">&lt;img src=x&gt; reckon</div>';
    applyHighlight(document, SELECTOR, ['reckon']);
    expect(document.querySelector('img')).toBeNull();
    expect(marks()).toEqual(['reckon']);
  });

  it('treats special characters in a surface as plain text', () => {
    expect(() => applyHighlight(document, SELECTOR, ['re(ckon'])).not.toThrow();
    expect(marks()).toEqual([]);
  });

  it('does nothing when the caption is gone', () => {
    document.body.innerHTML = '';
    expect(() => applyHighlight(document, SELECTOR, ['reckon'])).not.toThrow();
  });
});
