import { parseLrc, type LrcLine } from '@legendary/core';
import type { LyricsClient, LyricsQuery } from './lyrics';
import type { SpotifyPlayer, SpotifyState } from './player';

export class FakeSpotifyPlayer implements SpotifyPlayer {
  private state: SpotifyState = { kind: 'closed' };
  private setAt = 0;

  constructor(private readonly now: () => number) {}

  set(state: SpotifyState): void {
    this.state = state;
    this.setAt = this.now();
  }

  async read(): Promise<SpotifyState> {
    const state = this.state;
    if (state.kind !== 'track' || !state.playing) return state;
    return { ...state, positionS: state.positionS + (this.now() - this.setAt) / 1000 };
  }
}

export const E2E_SONGS: Record<string, string> = {
  'Northern Hunch': '[00:01.00] I had a hunch about you\n[00:02.00] Do not be so grumpy tonight',
  'Wary Heart': '[00:01.00] She is wary of the dark',
};

export class FakeLyricsClient implements LyricsClient {
  constructor(private readonly songs: Record<string, string>) {}

  async find({ name }: LyricsQuery): Promise<LrcLine[] | null> {
    const lrc = this.songs[name];
    return lrc ? parseLrc(lrc) : null;
  }
}
