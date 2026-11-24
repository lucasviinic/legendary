import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptionEvent, CaptionTrack } from '@legendary/contracts';
import { FakeLyricsClient, FakeSpotifyPlayer } from './fakes';
import type { SpotifyState } from './player';
import { SpotifySource } from './source';

const SONG =
  '[00:01.00] I had a hunch about you\n[00:03.00] You are so grumpy\n[00:05.00] Be wary of me';
const ranks = new Map(
  ['i', 'have', 'a', 'hunch', 'about', 'you', 'be', 'so', 'grumpy', 'wary', 'of', 'me'].map(
    (word, index) => [word, index + 1],
  ),
);

const track = (
  overrides: Partial<Extract<SpotifyState, { kind: 'track' }>> = {},
): SpotifyState => ({
  kind: 'track',
  id: 'spotify:track:1',
  name: 'Hunch',
  artist: 'The Fakes',
  album: 'Fakes',
  durationMs: 180_000,
  positionS: 0,
  playing: true,
  ...overrides,
});

function setup(songs: Record<string, string> = { Hunch: SONG }) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const now = () => Date.now();
  const player = new FakeSpotifyPlayer(now);
  const read = vi.spyOn(player, 'read');
  const source = new SpotifySource({ player, lyrics: new FakeLyricsClient(songs), ranks, now });
  const events = {
    songs: [] as string[],
    tracks: [] as string[][],
    captions: [] as string[],
    notices: [] as (string | null)[],
  };
  source.on('song', ({ title }: { title: string }) => events.songs.push(title));
  source.on('track', (value: CaptionTrack) => events.tracks.push(value.cues));
  source.on('caption', (caption: CaptionEvent) => {
    expect(caption).toMatchObject({ source: 'spotify', mediaTitle: events.songs.at(-1) });
    events.captions.push(caption.text);
  });
  source.on('notice', (notice: string | null) => events.notices.push(notice));
  return { player, read, source, events };
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

afterEach(() => vi.useRealTimers());

describe('SpotifySource', () => {
  it('says each line when the song reaches it', async () => {
    const { player, source, events } = setup();
    player.set(track());
    source.start();
    await advance(0);
    expect(events.songs).toEqual(['Hunch · The Fakes']);
    expect(events.tracks).toEqual([
      ['I had a hunch about you', 'You are so grumpy', 'Be wary of me'],
    ]);
    expect(events.notices).toEqual([null]);
    expect(events.captions).toEqual([]);
    await advance(1_000);
    expect(events.captions).toEqual(['I had a hunch about you']);
    await advance(2_000);
    expect(events.captions).toEqual(['I had a hunch about you', 'You are so grumpy']);
    await advance(2_000);
    expect(events.captions).toHaveLength(3);
  });

  it('starts in the middle of a song with the line being sung, and none before it', async () => {
    const { player, source, events } = setup();
    player.set(track({ positionS: 3.5 }));
    source.start();
    await advance(0);
    expect(events.captions).toEqual(['You are so grumpy']);
    await advance(1_500);
    expect(events.captions).toEqual(['You are so grumpy', 'Be wary of me']);
  });

  it('says nothing while the song is paused, and goes on without repeating a line', async () => {
    const { player, source, events } = setup();
    player.set(track({ positionS: 1.5 }));
    source.start();
    await advance(0);
    expect(events.captions).toEqual(['I had a hunch about you']);
    player.set(track({ positionS: 1.5, playing: false }));
    await advance(5_000);
    expect(events.captions).toHaveLength(1);
    player.set(track({ positionS: 1.5 }));
    await advance(1_000);
    expect(events.captions).toHaveLength(1);
    await advance(1_000);
    expect(events.captions).toEqual(['I had a hunch about you', 'You are so grumpy']);
  });

  it('follows a seek forward and back', async () => {
    const { player, source, events } = setup();
    player.set(track());
    source.start();
    await advance(1_100);
    expect(events.captions).toEqual(['I had a hunch about you']);
    player.set(track({ positionS: 5.2 }));
    await advance(900);
    expect(events.captions).toEqual(['I had a hunch about you', 'Be wary of me']);
    player.set(track({ positionS: 1.2 }));
    await advance(1_000);
    expect(events.captions.at(-1)).toBe('I had a hunch about you');
    await advance(2_000);
    expect(events.captions.at(-1)).toBe('You are so grumpy');
  });

  it('tells a new song apart and fetches its lyrics', async () => {
    const { player, source, events } = setup({
      Hunch: '[00:02.50] I had a hunch about you',
      Other: '[00:01.00] Be wary again',
    });
    player.set(track());
    source.start();
    await advance(500);
    player.set(track({ id: 'spotify:track:2', name: 'Other' }));
    await advance(2_000);
    expect(events.songs).toEqual(['Hunch · The Fakes', 'Other · The Fakes']);
    expect(events.tracks).toHaveLength(2);
    expect(events.captions).toEqual(['Be wary again']);
  });

  it('warns when Spotify is closed, refused or has no lyrics in English', async () => {
    const { player, source, events } = setup({
      Hunch: SONG,
      Saudade: '[00:01.00] Eu quero você aqui comigo agora',
    });
    source.start();
    await advance(0);
    player.set({ kind: 'denied' });
    await advance(1_000);
    player.set(track());
    await advance(1_000);
    player.set(track({ id: 'spotify:track:2', name: 'Silent' }));
    await advance(1_000);
    player.set(track({ id: 'spotify:track:3', name: 'Saudade' }));
    await advance(1_000);
    player.set({ kind: 'stopped' });
    await advance(1_000);
    expect(events.notices).toEqual([
      'spotify_waiting',
      'spotify_denied',
      null,
      'no_lyrics',
      'spotify_waiting',
    ]);
    expect(events.tracks).toHaveLength(1);
    expect(events.songs).toEqual([
      'Hunch · The Fakes',
      'Silent · The Fakes',
      'Saudade · The Fakes',
    ]);
  });

  it('stops reading and saying lines', async () => {
    const { player, read, source, events } = setup();
    player.set(track());
    source.start();
    await advance(0);
    source.stop();
    const reads = read.mock.calls.length;
    await advance(10_000);
    expect(events.captions).toEqual([]);
    expect(read.mock.calls.length).toBe(reads);
  });
});
