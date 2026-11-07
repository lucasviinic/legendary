import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionEvent } from '@legendary/contracts';
import { readCaption, readTitle, watchCaptions } from '../lib/caption-watcher';
import selectors from '../selectors.json';

const fixture = (name: string) => readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8');

const NETFLIX = { source: 'netflix', ...selectors.netflix } as const;
const YOUTUBE = { source: 'youtube', ...selectors.youtube } as const;

describe('reading the page', () => {
  it('reads a Netflix caption with its line break as one sentence', () => {
    document.body.innerHTML = fixture('netflix.html');
    expect(readCaption(NETFLIX, document)).toBe('I reckon we should head out before it gets dark.');
  });

  it('joins the YouTube caption segments', () => {
    document.body.innerHTML = fixture('youtube.html');
    expect(readCaption(YOUTUBE, document)).toBe('the moon pulls the ocean toward it');
  });

  it('returns nothing when no caption is on screen', () => {
    document.body.innerHTML = '<div></div>';
    expect(readCaption(NETFLIX, document)).toBe('');
  });

  it('reads the title from the page', () => {
    document.body.innerHTML = fixture('youtube.html');
    expect(readTitle(YOUTUBE, document)).toBe('How tides actually work');
  });

  it('falls back to the document title without the site name', () => {
    document.body.innerHTML = '<div></div>';
    document.title = 'How tides work - YouTube';
    expect(readTitle(YOUTUBE, document)).toBe('How tides work');
  });
});

describe('watchCaptions', () => {
  let sent: CaptionEvent[];
  let stop: () => void;

  const container = () => document.querySelector('.player-timedtext')!;
  const show = async (text: string) => {
    container().innerHTML = `<span>${text}</span>`;
    await vi.advanceTimersByTimeAsync(400);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = fixture('netflix.html');
    container().innerHTML = '';
    sent = [];
    stop = watchCaptions({ site: NETFLIX, root: document, send: (caption) => sent.push(caption) });
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('sends a new caption with its source and title', async () => {
    await show('I reckon so.');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      text: 'I reckon so.',
      source: 'netflix',
      mediaTitle: 'Northbound T1E3',
    });
  });

  it('does not repeat a caption that stays on screen', async () => {
    await show('I reckon so.');
    await show('I reckon so.');
    expect(sent).toHaveLength(1);
  });

  it('sends a caption when the text changes', async () => {
    await show('I reckon so.');
    await show('Maybe not.');
    expect(sent.map((caption) => caption.text)).toEqual(['I reckon so.', 'Maybe not.']);
  });

  it('sends a caption that comes back after another one', async () => {
    await show('Yes.');
    await show('No.');
    await show('Yes.');
    expect(sent).toHaveLength(3);
  });

  it('waits for a rolling caption to settle', async () => {
    container().innerHTML = '<span>the moon</span>';
    await vi.advanceTimersByTimeAsync(100);
    container().innerHTML = '<span>the moon pulls</span>';
    await vi.advanceTimersByTimeAsync(100);
    container().innerHTML = '<span>the moon pulls the ocean</span>';
    await vi.advanceTimersByTimeAsync(400);
    expect(sent.map((caption) => caption.text)).toEqual(['the moon pulls the ocean']);
  });

  it('ignores an empty caption', async () => {
    await show('   ');
    expect(sent).toEqual([]);
  });

  it('stops watching when asked', async () => {
    stop();
    await show('I reckon so.');
    expect(sent).toEqual([]);
  });

  it('finds a caption container added after it started', async () => {
    stop();
    document.body.innerHTML = '<div id="late"></div>';
    stop = watchCaptions({ site: NETFLIX, root: document, send: (caption) => sent.push(caption) });
    document.getElementById('late')!.innerHTML =
      '<div class="player-timedtext"><span>Hello.</span></div>';
    await vi.advanceTimersByTimeAsync(400);
    expect(sent.map((caption) => caption.text)).toEqual(['Hello.']);
  });
});
