import { describe, expect, it, vi } from 'vitest';
import type { CaptionTrack } from '@legendary/contracts';
import { parseJson3, readTimedTextUrl, watchTrack } from '../lib/track';

const ORIGIN = 'https://www.youtube.com';
const timedText = (params: string) => `${ORIGIN}/api/timedtext?v=abc&${params}&fmt=srv3`;

describe('parseJson3', () => {
  it('joins the pieces of each caption and drops the empty ones', () => {
    const data = {
      events: [
        { tStartMs: 0, segs: [{ utf8: 'I reckon' }, { utf8: ' we should\nhead out.' }] },
        { tStartMs: 10, segs: [{ utf8: '\n' }] },
        { tStartMs: 20 },
        { tStartMs: 30, segs: [{ utf8: 'Fair enough.' }] },
      ],
    };
    expect(parseJson3(data)).toEqual(['I reckon we should head out.', 'Fair enough.']);
  });

  it('reads nothing from an unexpected answer', () => {
    expect(parseJson3(null)).toEqual([]);
    expect(parseJson3({ other: true })).toEqual([]);
  });
});

describe('readTimedTextUrl', () => {
  it('asks for the JSON format of an English track', () => {
    const found = readTimedTextUrl(timedText('lang=en'), ORIGIN);
    expect(new URL(found!.url).searchParams.get('fmt')).toBe('json3');
  });

  it('accepts a regional English and automatic captions', () => {
    expect(readTimedTextUrl(timedText('lang=en-GB'), ORIGIN)).not.toBeNull();
    expect(readTimedTextUrl(timedText('lang=en&kind=asr'), ORIGIN)).not.toBeNull();
  });

  it('refuses a track in another language, even one translated by the player', () => {
    expect(readTimedTextUrl(timedText('lang=pt'), ORIGIN)).toBeNull();
    expect(readTimedTextUrl(timedText('lang=en&tlang=pt'), ORIGIN)).toBeNull();
  });

  it('refuses other requests and other sites', () => {
    expect(readTimedTextUrl(`${ORIGIN}/watch?v=abc`, ORIGIN)).toBeNull();
    expect(readTimedTextUrl('https://evil.test/api/timedtext?lang=en', ORIGIN)).toBeNull();
    expect(readTimedTextUrl('not a url', 'not an origin')).toBeNull();
  });

  it('gives the same key to two requests for the same track', () => {
    const first = readTimedTextUrl(timedText('lang=en&pot=1'), ORIGIN);
    const second = readTimedTextUrl(timedText('lang=en&pot=2'), ORIGIN);
    expect(first?.key).toBe(second?.key);
  });
});

describe('watchTrack', () => {
  function setup(fetchJson: (url: string) => Promise<unknown>) {
    let report: (url: string) => void = () => undefined;
    const sent: CaptionTrack[] = [];
    watchTrack({
      source: 'youtube',
      origin: ORIGIN,
      observe: (onUrl) => {
        report = onUrl;
        return () => undefined;
      },
      fetchJson,
      send: (track) => sent.push(track),
    });
    return { report: (url: string) => report(url), sent };
  }

  const answer = { events: [{ segs: [{ utf8: 'I reckon so.' }] }] };

  it('sends the whole track once the player downloads it', async () => {
    const fetchJson = vi.fn(async () => answer);
    const { report, sent } = setup(fetchJson);
    report(timedText('lang=en'));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ source: 'youtube', cues: ['I reckon so.'] });
  });

  it('does not download the same track twice', async () => {
    const fetchJson = vi.fn(async () => answer);
    const { report, sent } = setup(fetchJson);
    report(timedText('lang=en&pot=1'));
    report(timedText('lang=en&pot=2'));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('ignores the requests that are not captions', () => {
    const fetchJson = vi.fn(async () => answer);
    const { report } = setup(fetchJson);
    report(`${ORIGIN}/youtubei/v1/player`);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('tries again when the player asks for the track after a failure', async () => {
    const fetchJson = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(answer);
    const { report, sent } = setup(fetchJson);
    report(timedText('lang=en'));
    await vi.waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    report(timedText('lang=en'));
    await vi.waitFor(() => expect(sent).toHaveLength(1));
  });

  it('keeps only the track of the latest video', async () => {
    let finishFirst: (value: unknown) => void = () => undefined;
    const fetchJson = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValue({ events: [{ segs: [{ utf8: 'Second video.' }] }] });
    const { report, sent } = setup(fetchJson);
    report(`${ORIGIN}/api/timedtext?v=one&lang=en`);
    report(`${ORIGIN}/api/timedtext?v=two&lang=en`);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    finishFirst(answer);
    await Promise.resolve();
    expect(sent).toEqual([{ source: 'youtube', cues: ['Second video.'] }]);
  });
});
