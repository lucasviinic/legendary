import { describe, expect, it, vi } from 'vitest';
import { FakeSpotifyPlayer } from './fakes';
import { AppleScriptPlayer, type ScriptResult } from './player';

const ok = (stdout: string): ScriptResult => ({ code: 0, stdout, stderr: '' });
const failed = (stderr: string): ScriptResult => ({ code: 1, stdout: '', stderr });

function playerWith(running: ScriptResult, track: ScriptResult = ok('')) {
  const run = vi.fn(async (script: string) => (script.includes('is running') ? running : track));
  return { player: new AppleScriptPlayer(run), run };
}

describe('AppleScriptPlayer', () => {
  it('says Spotify is closed without talking to it, which would open it', async () => {
    const { player, run } = playerWith(ok('false\n'));
    await expect(player.read()).resolves.toEqual({ kind: 'closed' });
    expect(run).toHaveBeenCalledOnce();
  });

  it('reads the track, the time and whether it is playing', async () => {
    const { player } = playerWith(
      ok('true\n'),
      ok(
        'playing\tspotify:track:1\tMan I Need\tOlivia Dean\tMan I Need\t182000\t40,256000518799\n',
      ),
    );
    await expect(player.read()).resolves.toEqual({
      kind: 'track',
      id: 'spotify:track:1',
      name: 'Man I Need',
      artist: 'Olivia Dean',
      album: 'Man I Need',
      durationMs: 182_000,
      positionS: 40.256000518799,
      playing: true,
    });
  });

  it('tells a paused track apart', async () => {
    const { player } = playerWith(
      ok('true\n'),
      ok('paused\tspotify:track:1\tMan I Need\tOlivia Dean\tMan I Need\t182000\t40.5\n'),
    );
    await expect(player.read()).resolves.toMatchObject({ kind: 'track', playing: false });
  });

  it('says Spotify is stopped when nothing is loaded', async () => {
    const { player } = playerWith(ok('true\n'), ok('stopped\n'));
    await expect(player.read()).resolves.toEqual({ kind: 'stopped' });
  });

  it('treats a track without name as stopped', async () => {
    const { player } = playerWith(ok('true\n'), ok('playing\tspotify:track:1\t\t\t\t0\t0\n'));
    await expect(player.read()).resolves.toEqual({ kind: 'stopped' });
  });

  it('says when macOS refused the control of Spotify', async () => {
    const { player } = playerWith(
      ok('true\n'),
      failed('execution error: Not authorized to send Apple events to Spotify. (-1743)'),
    );
    await expect(player.read()).resolves.toEqual({ kind: 'denied' });
  });

  it('treats any other error as stopped', async () => {
    const { player } = playerWith(ok('true\n'), failed('execution error: (-600)'));
    await expect(player.read()).resolves.toEqual({ kind: 'stopped' });
  });
});

describe('FakeSpotifyPlayer', () => {
  it('moves the time on while the track plays', async () => {
    let now = 1_000;
    const player = new FakeSpotifyPlayer(() => now);
    await expect(player.read()).resolves.toEqual({ kind: 'closed' });
    player.set({
      kind: 'track',
      id: 'a',
      name: 'A',
      artist: 'B',
      album: 'C',
      durationMs: 1_000,
      positionS: 2,
      playing: true,
    });
    now += 1_500;
    await expect(player.read()).resolves.toMatchObject({ positionS: 3.5 });
  });
});
