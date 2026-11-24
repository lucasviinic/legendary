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
