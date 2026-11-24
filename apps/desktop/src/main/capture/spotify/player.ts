import { execFile } from 'node:child_process';

export type SpotifyState =
  | { kind: 'closed' }
  | { kind: 'denied' }
  | { kind: 'stopped' }
  | {
      kind: 'track';
      id: string;
      name: string;
      artist: string;
      album: string;
      durationMs: number;
      positionS: number;
      playing: boolean;
    };

export interface SpotifyPlayer {
  read(): Promise<SpotifyState>;
}

export interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type ScriptRunner = (script: string) => Promise<ScriptResult>;

const SCRIPT_TIMEOUT_MS = 5_000;
const NOT_AUTHORIZED = '-1743';
const IS_RUNNING = 'application "Spotify" is running';
const READ_TRACK = [
  'tell application "Spotify"',
  'if player state is stopped then return "stopped"',
  'set t to current track',
  'return (player state as text) & tab & (id of t) & tab & (name of t) & tab & (artist of t) & tab & (album of t) & tab & (duration of t) & tab & (player position as text)',
  'end tell',
].join('\n');

export const runOsascript: ScriptRunner = (script) =>
  new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', script],
      { timeout: SCRIPT_TIMEOUT_MS },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          stdout,
          stderr,
        });
      },
    );
  });

export class AppleScriptPlayer implements SpotifyPlayer {
  constructor(private readonly run: ScriptRunner = runOsascript) {}

  async read(): Promise<SpotifyState> {
    const running = await this.run(IS_RUNNING);
    if (running.stdout.trim() !== 'true') return { kind: 'closed' };

    const result = await this.run(READ_TRACK);
    if (result.code !== 0) {
      return result.stderr.includes(NOT_AUTHORIZED) ? { kind: 'denied' } : { kind: 'stopped' };
    }
    const output = result.stdout.replace(/\n$/, '');
    if (output === 'stopped') return { kind: 'stopped' };

    const [state, id, name, artist, album, duration, position] = output.split('\t');
    if (!id || !name || !artist) return { kind: 'stopped' };
    return {
      kind: 'track',
      id,
      name,
      artist,
      album: album ?? '',
      durationMs: Number(duration),
      positionS: Number((position ?? '0').replace(',', '.')),
      playing: state === 'playing',
    };
  }
}
