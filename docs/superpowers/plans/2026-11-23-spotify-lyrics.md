# Letras do Spotify — plano de implementação

> **Para agentes:** use superpowers:executing-plans (ou superpowers:subagent-driven-development)
> para executar este plano tarefa por tarefa. Os passos usam caixas (`- [ ]`) para acompanhar.

**Goal:** nova origem "Spotify" que transforma cada verso cantado no app do Spotify para Mac numa
legenda do Legendary, com uma sessão por música.

**Architecture:** um `SpotifySource` no main lê o Spotify por AppleScript a cada segundo, busca a
letra sincronizada no LRCLIB e emite `song`, `track`, `caption` e `notice`. O `SessionService` abre e
fecha uma sessão por música e repassa os versos ao vocabulário, que já faz o resto.

**Tech Stack:** Electron (main em Node), TypeScript, Zod, Vitest, Playwright, React + Tailwind,
`osascript`, LRCLIB.

**Spec:** `docs/superpowers/specs/2026-11-23-spotify-lyrics-design.md`. Referência visual: `design/`.

## Global Constraints

- Sem comentários no código, nem nos testes.
- Commits sem `Co-authored-by` (o commitlint recusa). Tipos e escopos do `commitlint.config.ts`.
- Textos da interface em português, iguais ao spec: "Spotify", "letras sincronizadas",
  "Abra o Spotify e dê play", "esperando…", "Libere o controle do Spotify", "Ajustes › Automação",
  "Sem letra em inglês para esta música", "esperando a próxima".
- `User-Agent` do LRCLIB: `Legendary/<versão do app>`, sem dado pessoal.
- Toda mudança de tela passa primeiro pelo mockup (`design/Legendary Mockups.dc.html` e o projeto do
  Claude Design) e termina com `make test-visual` e uma olhada na janela real.
- Testes do desktop: `node scripts/vitest-electron.mjs run <arquivo>` dentro de `apps/desktop`.
  Testes dos pacotes: `npx vitest run <arquivo>` dentro do pacote.

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/contracts/src/common.ts` | `spotify` em `SourceSchema` e `CaptureOriginSchema` |
| `packages/contracts/src/domain.ts` | avisos `spotify_waiting`, `spotify_denied`, `no_lyrics` |
| `packages/db/src/schema.ts` | `spotify` em `SOURCES` (só tipo, sem migração) |
| `packages/core/src/format/format.ts` | rótulo "Spotify" |
| `packages/core/src/lyrics/lrc.ts` (novo) | `parseLrc` |
| `packages/core/src/pipeline/english.ts` (novo) | `isMostlyEnglish` |
| `apps/desktop/src/main/capture/spotify/player.ts` (novo) | `SpotifyState`, `SpotifyPlayer`, `AppleScriptPlayer` |
| `apps/desktop/src/main/capture/spotify/lyrics.ts` (novo) | `LyricsClient`, `LrclibClient` |
| `apps/desktop/src/main/capture/spotify/fakes.ts` (novo) | `FakeSpotifyPlayer`, `FakeLyricsClient`, `E2E_SONGS` |
| `apps/desktop/src/main/capture/spotify/source.ts` (novo) | `SpotifySource` |
| `apps/desktop/src/main/services/vocabulary.ts` | `begin({ keepShown })` e cards da música anterior |
| `apps/desktop/src/main/services/session.ts` | sessão por música, aviso da origem, totais, quiz |
| `apps/desktop/src/main/index.ts` | liga o `SpotifySource` à sessão |
| `apps/desktop/src/renderer/menu/{MenuView,App}.tsx` | linhas de origem clicáveis |
| `apps/desktop/src/renderer/overlay/StatusBar.tsx` | rótulo e avisos do Spotify |
| `apps/desktop/src/renderer/preview/frames.tsx` | estados novos dos frames 1c e 1j |
| `apps/desktop/e2e/spotify.spec.ts` (novo) | E2E com Spotify e letras falsos |
| `apps/desktop/build/entitlements.mac.plist` (novo) e `electron-builder.yml` | permissão de AppleScript |

---

### Task 1: Spotify como fonte nos tipos e nos rótulos

**Files:**
- Modify: `packages/contracts/src/common.ts`, `packages/contracts/src/domain.ts:32`
- Modify: `packages/db/src/schema.ts:11`
- Modify: `packages/core/src/format/format.ts:56-80`
- Test: `packages/contracts/src/contracts.test.ts`, `packages/core/src/format/format.test.ts`

**Interfaces:**
- Produces: `Source` inclui `'spotify'`; `CaptureOrigin = 'browser' | 'spotify' | 'audio'`;
  `SessionNotice` inclui `'spotify_waiting' | 'spotify_denied' | 'no_lyrics'`;
  `sourceLabel('spotify') === 'Spotify'`.

- [ ] **Step 1: testes que falham**

Em `packages/contracts/src/contracts.test.ts`, acrescente `CaptureOriginSchema`,
`SessionNoticeSchema` e `SourceSchema` ao import de `./index` e, no fim do arquivo:

```ts
describe('Spotify', () => {
  it('is a source and a capture origin', () => {
    expect(SourceSchema.parse('spotify')).toBe('spotify');
    expect(CaptureOriginSchema.parse('spotify')).toBe('spotify');
  });

  it('has its own notices', () => {
    expect(SessionNoticeSchema.options).toEqual(
      expect.arrayContaining(['spotify_waiting', 'spotify_denied', 'no_lyrics']),
    );
  });
});
```

Em `packages/core/src/format/format.test.ts`, no `it.each` de `sourceLabel`, acrescente a linha
`['spotify', 'Spotify'],` e, no `describe('formatSessionMeta')`, depois do teste do YouTube:

```ts
  it('names Spotify', () => {
    expect(
      formatSessionMeta({
        ...session,
        source: 'spotify',
        durationMs: 3 * 60_000,
        wordCount: 6,
        quiz: null,
      }),
    ).toBe('Spotify · 3 min · 6 palavras');
  });
```

- [ ] **Step 2: ver falhar**

Run: `cd packages/contracts && npx vitest run` e `cd packages/core && npx vitest run src/format`
Expected: FAIL nos três testes novos (`spotify` inválido e rótulo ausente).

- [ ] **Step 3: implementação**

`packages/contracts/src/common.ts`:

```ts
export const SourceSchema = z.enum(['netflix', 'youtube', 'spotify', 'audio']);
export type Source = z.infer<typeof SourceSchema>;

export const CaptureOriginSchema = z.enum(['browser', 'spotify', 'audio']);
export type CaptureOrigin = z.infer<typeof CaptureOriginSchema>;
```

`packages/contracts/src/domain.ts`:

```ts
export const SessionNoticeSchema = z.enum([
  'no_captions',
  'ai_error',
  'spotify_waiting',
  'spotify_denied',
  'no_lyrics',
]);
```

`packages/db/src/schema.ts`:

```ts
const SOURCES = ['netflix', 'youtube', 'spotify', 'audio'] as const;
```

`packages/core/src/format/format.ts`:

```ts
const SOURCE_LABELS: Record<Source, string> = {
  netflix: 'Netflix',
  youtube: 'YouTube',
  spotify: 'Spotify',
  audio: 'Áudio',
};
```

e em `formatSessionMeta`, troque a primeira linha da lista por:

```ts
    session.source === 'youtube' || session.source === 'spotify'
      ? sourceLabel(session.source)
      : null,
```

- [ ] **Step 4: ver passar e checar tipos**

Run: `npx vitest run` em `packages/contracts` e `packages/core`, depois `pnpm -r typecheck` na raiz.
Expected: PASS. Se o typecheck apontar outro `Record<Source, …>` ou `switch` sem `spotify`, complete
com o rótulo "Spotify".

- [ ] **Step 5: commit**

```bash
git add packages/contracts packages/db/src/schema.ts packages/core/src/format
git commit -m "feat(contracts): add spotify as a source, an origin and its notices"
```

---

### Task 2: letra LRC e detecção de inglês

**Files:**
- Create: `packages/core/src/lyrics/lrc.ts`, `packages/core/src/lyrics/lrc.test.ts`
- Create: `packages/core/src/pipeline/english.ts`, `packages/core/src/pipeline/english.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/pipeline/index.ts`

**Interfaces:**
- Produces: `interface LrcLine { at: number; text: string }` e
  `parseLrc(lrc: string): LrcLine[]` em `@legendary/core`;
  `isMostlyEnglish(lines: readonly string[], ranks: ReadonlyMap<string, number>): boolean` em
  `@legendary/core/pipeline`.

- [ ] **Step 1: testes que falham**

`packages/core/src/lyrics/lrc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseLrc } from './lrc';

describe('parseLrc', () => {
  it('reads the time and the text of each line', () => {
    expect(parseLrc("[00:43.69] You're on my mind\n[00:48.35] Already gave you the time")).toEqual([
      { at: 43.69, text: "You're on my mind" },
      { at: 48.35, text: 'Already gave you the time' },
    ]);
  });

  it('counts the minutes', () => {
    expect(parseLrc('[01:02.50] Line')).toEqual([{ at: 62.5, text: 'Line' }]);
  });

  it('drops lines left without words', () => {
    expect(parseLrc('[00:01.00]\n[00:02.00] ♪\n[00:03.00] Hi')).toEqual([{ at: 3, text: 'Hi' }]);
  });

  it('repeats a line with several times, in time order', () => {
    expect(parseLrc('[00:10.00][00:30.00] Chorus\n[00:20.00] Verse')).toEqual([
      { at: 10, text: 'Chorus' },
      { at: 20, text: 'Verse' },
      { at: 30, text: 'Chorus' },
    ]);
  });

  it('skips tags without time and the times of each word', () => {
    expect(parseLrc('[ar:Someone]\n[00:05.00] <00:05.00>Hello <00:05.50>there')).toEqual([
      { at: 5, text: 'Hello there' },
    ]);
  });
});
```

`packages/core/src/pipeline/english.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isMostlyEnglish } from './english';

const ranks = new Map(
  ['i', 'you', 'be', "'re", 'on', 'my', 'mind', 'want', 'it'].map((word, index) => [word, index + 1]),
);

describe('isMostlyEnglish', () => {
  it('accepts lyrics in English', () => {
    expect(isMostlyEnglish(["You're on my mind", 'I want it'], ranks)).toBe(true);
  });

  it('refuses lyrics in Portuguese', () => {
    expect(isMostlyEnglish(['Eu quero você aqui comigo', 'Não vá embora agora'], ranks)).toBe(false);
  });

  it('refuses lyrics with less than half of the words in English', () => {
    expect(isMostlyEnglish(['I want você aqui comigo agora'], ranks)).toBe(false);
  });

  it('refuses lyrics without words', () => {
    expect(isMostlyEnglish([], ranks)).toBe(false);
  });
});
```

- [ ] **Step 2: ver falhar**

Run: `cd packages/core && npx vitest run src/lyrics src/pipeline/english.test.ts`
Expected: FAIL, os módulos não existem.

- [ ] **Step 3: implementação**

`packages/core/src/lyrics/lrc.ts`:

```ts
export interface LrcLine {
  at: number;
  text: string;
}

const STAMP = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const text = raw
      .replace(/\[[^\]]*\]/g, '')
      .replace(/<\d+:\d+(?:\.\d+)?>/g, '')
      .replace(/♪/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    for (const [, minutes, seconds] of raw.matchAll(STAMP)) {
      lines.push({ at: Number(minutes) * 60 + Number(seconds), text });
    }
  }
  return lines.sort((a, b) => a.at - b.at);
}
```

`packages/core/src/pipeline/english.ts`:

```ts
import { tokenize } from './tokenize';

const ENGLISH_SHARE = 0.5;

export function isMostlyEnglish(
  lines: readonly string[],
  ranks: ReadonlyMap<string, number>,
): boolean {
  const words = tokenize(lines.join('\n')).filter((token) => /\p{L}/u.test(token.surface));
  if (words.length === 0) return false;
  const known = words.filter(
    (token) => ranks.has(token.lemma) || ranks.has(token.surface.toLowerCase()),
  ).length;
  return known / words.length >= ENGLISH_SHARE;
}
```

Em `packages/core/src/index.ts`, acrescente `export * from './lyrics/lrc';`. Em
`packages/core/src/pipeline/index.ts`, acrescente `export { isMostlyEnglish } from './english';`
junto dos outros `export`.

- [ ] **Step 4: ver passar**

Run: `cd packages/core && npx vitest run`
Expected: PASS, com a cobertura acima de 80%.

- [ ] **Step 5: commit**

```bash
git add packages/core/src
git commit -m "feat(core): read LRC lyrics and tell lyrics in English apart"
```

---

### Task 3: leitura do Spotify por AppleScript

**Files:**
- Create: `apps/desktop/src/main/capture/spotify/player.ts`
- Create: `apps/desktop/src/main/capture/spotify/fakes.ts`
- Test: `apps/desktop/src/main/capture/spotify/player.test.ts`

**Interfaces:**
- Produces:

```ts
export type SpotifyState =
  | { kind: 'closed' }
  | { kind: 'denied' }
  | { kind: 'stopped' }
  | { kind: 'track'; id: string; name: string; artist: string; album: string; durationMs: number; positionS: number; playing: boolean };
export interface SpotifyPlayer { read(): Promise<SpotifyState> }
export interface ScriptResult { code: number; stdout: string; stderr: string }
export type ScriptRunner = (script: string) => Promise<ScriptResult>;
export class AppleScriptPlayer implements SpotifyPlayer { constructor(run?: ScriptRunner) }
export class FakeSpotifyPlayer implements SpotifyPlayer { constructor(now: () => number); set(state: SpotifyState): void }
```

- [ ] **Step 1: testes que falham**

`apps/desktop/src/main/capture/spotify/player.test.ts`:

```ts
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
      ok('playing\tspotify:track:1\tMan I Need\tOlivia Dean\tMan I Need\t182000\t40,256000518799\n'),
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
```

- [ ] **Step 2: ver falhar**

Run: `cd apps/desktop && node scripts/vitest-electron.mjs run src/main/capture/spotify/player.test.ts`
Expected: FAIL, os módulos não existem.

- [ ] **Step 3: implementação**

`apps/desktop/src/main/capture/spotify/player.ts`:

```ts
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
    execFile('osascript', ['-e', script], { timeout: SCRIPT_TIMEOUT_MS }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout,
        stderr,
      });
    });
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
```

`apps/desktop/src/main/capture/spotify/fakes.ts`:

```ts
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
```

- [ ] **Step 4: ver passar**

Run: `cd apps/desktop && node scripts/vitest-electron.mjs run src/main/capture/spotify/player.test.ts`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add apps/desktop/src/main/capture/spotify
git commit -m "feat(capture): read the track playing in Spotify through AppleScript"
```

---

### Task 4: cliente do LRCLIB

**Files:**
- Create: `apps/desktop/src/main/capture/spotify/lyrics.ts`
- Modify: `apps/desktop/src/main/capture/spotify/fakes.ts`
- Test: `apps/desktop/src/main/capture/spotify/lyrics.test.ts`

**Interfaces:**
- Consumes: `parseLrc`, `LrcLine` (Task 2).
- Produces:

```ts
export interface LyricsQuery { id: string; name: string; artist: string; album: string; durationS: number }
export interface LyricsClient { find(query: LyricsQuery): Promise<LrcLine[] | null> }
export type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export class LrclibClient implements LyricsClient { constructor(options: { userAgent: string; fetch?: Fetch }) }
export class FakeLyricsClient implements LyricsClient { constructor(songs: Record<string, string>) }
export const E2E_SONGS: Record<string, string>;
```

- [ ] **Step 1: testes que falham**

`apps/desktop/src/main/capture/spotify/lyrics.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { FakeLyricsClient } from './fakes';
import { LrclibClient, type Fetch } from './lyrics';

const LRC = '[00:01.00] I had a hunch\n[00:03.00] Do not be grumpy';
const OTHER = '[00:02.00] Something else';
const query = {
  id: 'spotify:track:1',
  name: 'Man I Need',
  artist: 'Olivia Dean',
  album: 'Man I Need',
  durationS: 182,
};

const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

function clientWith(...replies: (ReturnType<typeof reply> | Error)[]) {
  const fetch = vi.fn<Fetch>(async () => {
    const next = replies.shift();
    if (!next) throw new Error('sem resposta');
    if (next instanceof Error) throw next;
    return next;
  });
  return { client: new LrclibClient({ userAgent: 'Legendary/1.0', fetch }), fetch };
}

describe('LrclibClient', () => {
  it('asks for the track by name, artist, album and duration', async () => {
    const { client, fetch } = clientWith(reply(200, { duration: 184, syncedLyrics: LRC }));
    await expect(client.find(query)).resolves.toEqual([
      { at: 1, text: 'I had a hunch' },
      { at: 3, text: 'Do not be grumpy' },
    ]);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(
      'https://lrclib.net/api/get?track_name=Man+I+Need&artist_name=Olivia+Dean&album_name=Man+I+Need&duration=182',
    );
    expect(init.headers).toEqual({ 'User-Agent': 'Legendary/1.0' });
  });

  it('searches when the exact track has no synced lyrics, and keeps the closest duration', async () => {
    const { client, fetch } = clientWith(
      reply(404, { message: 'not found' }),
      reply(200, [
        { duration: 186, syncedLyrics: OTHER },
        { duration: 183, syncedLyrics: LRC },
        { duration: 182, syncedLyrics: null },
      ]),
    );
    await expect(client.find(query)).resolves.toEqual([
      { at: 1, text: 'I had a hunch' },
      { at: 3, text: 'Do not be grumpy' },
    ]);
    expect(fetch.mock.calls[1]![0]).toBe(
      'https://lrclib.net/api/search?track_name=Man+I+Need&artist_name=Olivia+Dean',
    );
  });

  it('leaves out results more than 5 s away from the track', async () => {
    const { client } = clientWith(
      reply(404, {}),
      reply(200, [{ duration: 190, syncedLyrics: LRC }]),
    );
    await expect(client.find(query)).resolves.toBeNull();
  });

  it('keeps the answer of each track, even when there are no lyrics', async () => {
    const { client, fetch } = clientWith(reply(404, {}), reply(200, []));
    await expect(client.find(query)).resolves.toBeNull();
    await expect(client.find(query)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('asks again after a network error', async () => {
    const { client, fetch } = clientWith(
      new Error('offline'),
      reply(200, { duration: 182, syncedLyrics: LRC }),
    );
    await expect(client.find(query)).resolves.toBeNull();
    await expect(client.find(query)).resolves.toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('asks again after a server error', async () => {
    const { client } = clientWith(reply(500, {}), reply(200, { duration: 182, syncedLyrics: LRC }));
    await expect(client.find(query)).resolves.toBeNull();
    await expect(client.find(query)).resolves.toHaveLength(2);
  });
});

describe('FakeLyricsClient', () => {
  it('finds the lyrics by the name of the track', async () => {
    const lyrics = new FakeLyricsClient({ 'Man I Need': LRC });
    await expect(lyrics.find(query)).resolves.toHaveLength(2);
    await expect(lyrics.find({ ...query, name: 'Other' })).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: ver falhar**

Run: `cd apps/desktop && node scripts/vitest-electron.mjs run src/main/capture/spotify/lyrics.test.ts`
Expected: FAIL, `./lyrics` não existe e `FakeLyricsClient` não é exportado.

- [ ] **Step 3: implementação**

`apps/desktop/src/main/capture/spotify/lyrics.ts`:

```ts
import { parseLrc, type LrcLine } from '@legendary/core';

export interface LyricsQuery {
  id: string;
  name: string;
  artist: string;
  album: string;
  durationS: number;
}

export interface LyricsClient {
  find(query: LyricsQuery): Promise<LrcLine[] | null>;
}

export type Fetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface LrclibRecord {
  duration?: unknown;
  syncedLyrics?: unknown;
}

const BASE = 'https://lrclib.net/api';
const TIMEOUT_MS = 10_000;
const SEARCH_TOLERANCE_S = 5;

const synced = (record: LrclibRecord | null | undefined): string | null =>
  typeof record?.syncedLyrics === 'string' && record.syncedLyrics.trim()
    ? record.syncedLyrics
    : null;

const linesOf = (lrc: string | null): LrcLine[] | null => {
  const lines = lrc ? parseLrc(lrc) : [];
  return lines.length > 0 ? lines : null;
};

export class LrclibClient implements LyricsClient {
  private readonly cache = new Map<string, LrcLine[] | null>();

  constructor(private readonly options: { userAgent: string; fetch?: Fetch }) {}

  async find(query: LyricsQuery): Promise<LrcLine[] | null> {
    if (this.cache.has(query.id)) return this.cache.get(query.id) ?? null;
    let lines: LrcLine[] | null;
    try {
      lines = await this.lookup(query);
    } catch {
      return null;
    }
    this.cache.set(query.id, lines);
    return lines;
  }

  private async lookup(query: LyricsQuery): Promise<LrcLine[] | null> {
    const exact = await this.get<LrclibRecord>('get', {
      track_name: query.name,
      artist_name: query.artist,
      album_name: query.album,
      duration: String(Math.round(query.durationS)),
    });
    const exactLyrics = synced(exact);
    if (exactLyrics) return linesOf(exactLyrics);

    const results = await this.get<LrclibRecord[]>('search', {
      track_name: query.name,
      artist_name: query.artist,
    });
    const distance = (record: LrclibRecord) =>
      typeof record.duration === 'number' ? Math.abs(record.duration - query.durationS) : Infinity;
    const best = (Array.isArray(results) ? results : [])
      .filter((record) => synced(record) && distance(record) <= SEARCH_TOLERANCE_S)
      .sort((a, b) => distance(a) - distance(b))[0];
    return linesOf(synced(best));
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const fetcher = this.options.fetch ?? (globalThis.fetch as unknown as Fetch);
    const response = await fetcher(`${BASE}/${path}?${new URLSearchParams(params)}`, {
      headers: { 'User-Agent': this.options.userAgent },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`O LRCLIB respondeu ${response.status}.`);
    return (await response.json()) as T;
  }
}
```

Em `apps/desktop/src/main/capture/spotify/fakes.ts`, acrescente os imports
`import { parseLrc, type LrcLine } from '@legendary/core';` e
`import type { LyricsClient, LyricsQuery } from './lyrics';` e, no fim:

```ts
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
```

- [ ] **Step 4: ver passar**

Run: `cd apps/desktop && node scripts/vitest-electron.mjs run src/main/capture/spotify`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add apps/desktop/src/main/capture/spotify
git commit -m "feat(capture): fetch synced lyrics from LRCLIB"
```

---

### Task 5: `SpotifySource`

**Files:**
- Create: `apps/desktop/src/main/capture/spotify/source.ts`
- Test: `apps/desktop/src/main/capture/spotify/source.test.ts`

**Interfaces:**
- Consumes: `SpotifyPlayer`, `SpotifyState` (Task 3), `LyricsClient` (Task 4),
  `isMostlyEnglish` (Task 2), `CaptionSource` (`../caption-source`).
- Produces:

```ts
export type SpotifyNotice = 'spotify_waiting' | 'spotify_denied' | 'no_lyrics';
export interface SpotifySourceDeps { player: SpotifyPlayer; lyrics: LyricsClient; ranks: ReadonlyMap<string, number>; now: () => number }
export class SpotifySource extends EventEmitter implements CaptionSource {
  start(): void; stop(): void;
}
```

Eventos: `song` → `{ id: string; title: string }`; `track` → `CaptionTrack`;
`caption` → `CaptionEvent`; `notice` → `SpotifyNotice | null`.

- [ ] **Step 1: testes que falham**

`apps/desktop/src/main/capture/spotify/source.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptionEvent, CaptionTrack } from '@legendary/contracts';
import { FakeLyricsClient, FakeSpotifyPlayer } from './fakes';
import type { SpotifyState } from './player';
import { SpotifySource } from './source';

const SONG = '[00:01.00] I had a hunch about you\n[00:03.00] You are so grumpy\n[00:05.00] Be wary of me';
const ranks = new Map(
  ['i', 'have', 'a', 'hunch', 'about', 'you', 'be', 'so', 'grumpy', 'wary', 'of', 'me'].map(
    (word, index) => [word, index + 1],
  ),
);

const track = (overrides: Partial<Extract<SpotifyState, { kind: 'track' }>> = {}): SpotifyState => ({
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
    expect(events.tracks).toEqual([['I had a hunch about you', 'You are so grumpy', 'Be wary of me']]);
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
    expect(events.songs).toEqual(['Hunch · The Fakes', 'Silent · The Fakes', 'Saudade · The Fakes']);
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
```

- [ ] **Step 2: ver falhar**

Run: `cd apps/desktop && node scripts/vitest-electron.mjs run src/main/capture/spotify/source.test.ts`
Expected: FAIL, `./source` não existe.

- [ ] **Step 3: implementação**

`apps/desktop/src/main/capture/spotify/source.ts`:

```ts
import { EventEmitter } from 'node:events';
import type { CaptionEvent, CaptionTrack } from '@legendary/contracts';
import type { LrcLine } from '@legendary/core';
import { isMostlyEnglish } from '@legendary/core/pipeline';
import type { CaptionSource } from '../caption-source';
import type { LyricsClient } from './lyrics';
import type { SpotifyPlayer, SpotifyState } from './player';

export type SpotifyNotice = 'spotify_waiting' | 'spotify_denied' | 'no_lyrics';

export interface SpotifySourceDeps {
  player: SpotifyPlayer;
  lyrics: LyricsClient;
  ranks: ReadonlyMap<string, number>;
  now: () => number;
}

type Playing = Extract<SpotifyState, { kind: 'track' }>;

interface Anchor {
  positionS: number;
  at: number;
  playing: boolean;
}

const POLL_MS = 1_000;
const SEEK_TOLERANCE_S = 1.5;
const EARLY_S = 0.05;

export class SpotifySource extends EventEmitter implements CaptionSource {
  private running = false;
  private reading = false;
  private poller: ReturnType<typeof setInterval> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private trackId: string | null = null;
  private title = '';
  private lines: LrcLine[] | null = null;
  private next = 0;
  private lastSaid = -1;
  private anchor: Anchor | null = null;
  private notice: SpotifyNotice | null | undefined;

  constructor(private readonly deps: SpotifySourceDeps) {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.poll();
    this.poller = setInterval(() => void this.poll(), POLL_MS);
  }

  stop(): void {
    this.running = false;
    clearInterval(this.poller);
    clearTimeout(this.timer);
    this.trackId = null;
    this.lines = null;
    this.anchor = null;
    this.lastSaid = -1;
    this.notice = undefined;
  }

  private async poll() {
    if (this.reading || !this.running) return;
    this.reading = true;
    try {
      const at = this.deps.now();
      const state = await this.deps.player.read();
      if (this.running) await this.apply(state, at);
    } finally {
      this.reading = false;
    }
  }

  private async apply(state: SpotifyState, at: number) {
    if (state.kind !== 'track') {
      clearTimeout(this.timer);
      this.anchor = null;
      this.setNotice(state.kind === 'denied' ? 'spotify_denied' : 'spotify_waiting');
      return;
    }
    if (state.id !== this.trackId) await this.changeTrack(state);
    if (!this.running || state.id !== this.trackId) return;
    this.setNotice(this.lines ? null : 'no_lyrics');
    this.follow(state, at);
  }

  private async changeTrack(state: Playing) {
    clearTimeout(this.timer);
    this.trackId = state.id;
    this.title = `${state.name} · ${state.artist}`;
    this.lines = null;
    this.anchor = null;
    this.next = 0;
    this.lastSaid = -1;
    this.emit('song', { id: state.id, title: this.title });

    const found = await this.deps.lyrics.find({
      id: state.id,
      name: state.name,
      artist: state.artist,
      album: state.album,
      durationS: state.durationMs / 1000,
    });
    if (!this.running || this.trackId !== state.id) return;
    if (!found || !isMostlyEnglish(found.map((line) => line.text), this.deps.ranks)) return;
    this.lines = found;
    const track: CaptionTrack = { source: 'spotify', cues: found.map((line) => line.text) };
    this.emit('track', track);
  }

  private follow(state: Playing, at: number) {
    const previous = this.anchor;
    this.anchor = { positionS: state.positionS, at, playing: state.playing };
    if (!this.lines || !state.playing) {
      clearTimeout(this.timer);
      return;
    }
    const expected =
      previous?.playing === true ? previous.positionS + (at - previous.at) / 1000 : null;
    if (expected === null || Math.abs(state.positionS - expected) > SEEK_TOLERANCE_S) {
      const current = this.lineAt(this.estimate());
      if (current >= 0 && current !== this.lastSaid) this.say(current);
      this.next = current + 1;
    }
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    const lines = this.lines;
    if (!lines || !this.anchor?.playing || this.next >= lines.length) return;
    const wait = (lines[this.next]!.at - this.estimate()) * 1000;
    if (wait <= 0) {
      this.reach();
      return;
    }
    this.timer = setTimeout(() => this.reach(), wait);
  }

  private reach() {
    const lines = this.lines;
    if (!lines || !this.anchor) return;
    const position = this.estimate();
    while (this.next < lines.length && lines[this.next]!.at <= position + EARLY_S) {
      this.say(this.next);
      this.next += 1;
    }
    this.schedule();
  }

  private say(index: number) {
    const line = this.lines![index]!;
    this.lastSaid = index;
    const caption: CaptionEvent = {
      text: line.text,
      startedAt: this.deps.now(),
      source: 'spotify',
      mediaTitle: this.title,
    };
    this.emit('caption', caption);
  }

  private estimate(): number {
    const anchor = this.anchor!;
    return anchor.positionS + (anchor.playing ? (this.deps.now() - anchor.at) / 1000 : 0);
  }

  private lineAt(position: number): number {
    let index = -1;
    this.lines!.forEach((line, i) => {
      if (line.at <= position) index = i;
    });
    return index;
  }

  private setNotice(notice: SpotifyNotice | null) {
    if (notice === this.notice) return;
    this.notice = notice;
    this.emit('notice', notice);
  }
}
```

- [ ] **Step 4: ver passar**

Run: `cd apps/desktop && node scripts/vitest-electron.mjs run src/main/capture/spotify`
Expected: PASS. Se um tempo de teste ficar no limite de um verso, ajuste o teste para cair no meio
do intervalo entre dois versos, sem mudar o comportamento do código.

- [ ] **Step 5: commit**

```bash
git add apps/desktop/src/main/capture/spotify
git commit -m "feat(capture): say each Spotify lyric line when the song reaches it"
```

---

### Task 6: uma sessão por música

**Files:**
- Modify: `apps/desktop/src/main/services/vocabulary.ts` (`begin`, `toggleSaved`, `unmarkKnown`)
- Modify: `apps/desktop/src/main/services/session.ts`
- Test: `apps/desktop/src/main/services/session.test.ts`

**Interfaces:**
- Consumes: `SessionNotice` (Task 1).
- Produces: `VocabularyService.begin(options?: { keepShown?: boolean }): void`;
  `SessionService.handleSong(): Promise<void>`;
  `SessionService.setSourceNotice(notice: SessionNotice | null): void`.

- [ ] **Step 1: testes que falham**

No fim de `apps/desktop/src/main/services/session.test.ts`:

```ts
describe('Spotify songs', () => {
  const line = (text: string, title: string): CaptionEvent => ({
    text,
    startedAt: 1,
    source: 'spotify',
    mediaTitle: title,
  });

  beforeEach(() => h.session.start('spotify'));

  it('opens one session per song, from when it starts to when the next one starts', async () => {
    const start = h.clock.now;
    await h.session.handleSong();
    h.clock.now += 1_000;
    h.session.handleCaption(line('I reckon so.', 'Song A · Artist'));
    h.clock.now += 60_000;
    await h.session.handleSong();
    h.session.handleCaption(line('She is wary.', 'Song B · Artist'));
    const [b, a] = h.repos.sessions.list();
    expect(a).toMatchObject({
      title: 'Song A · Artist',
      source: 'spotify',
      startedAt: start,
      endedAt: start + 61_000,
    });
    expect(b).toMatchObject({ title: 'Song B · Artist', startedAt: start + 61_000, endedAt: null });
  });

  it('leaves no session for a song without lyrics', async () => {
    await h.session.handleSong();
    await h.session.handleSong();
    h.session.handleCaption(line('She is wary.', 'Song B · Artist'));
    expect(h.repos.sessions.list().map(({ title }) => title)).toEqual(['Song B · Artist']);
  });

  it('holds the lines of the next song until the switch is done', async () => {
    await h.session.handleSong();
    h.session.handleCaption(line('I reckon so.', 'Song A · Artist'));
    h.clock.now += 1_000;
    const switching = h.session.handleSong();
    h.session.handleCaption(line('She is wary.', 'Song B · Artist'));
    expect(h.repos.sessions.list()).toHaveLength(1);
    await switching;
    expect(h.repos.sessions.list().map(({ title }) => title)).toEqual([
      'Song B · Artist',
      'Song A · Artist',
    ]);
    expect(h.events.cards.map(({ lemma }) => lemma)).toEqual(['reckon', 'wary']);
  });

  it('saves the translations still on the way into the song they came from', async () => {
    await h.session.handleSong();
    h.session.handleCaption(line('I reckon so.', 'Song A · Artist'));
    await h.session.handleSong();
    const a = h.repos.sessions.list().find(({ title }) => title === 'Song A · Artist')!;
    const sense = h.repos.senses.findByLemmaPos('reckon', 'verb')!;
    expect(h.repos.sessionWords.forSense(a.id, sense.id)).toBeDefined();
  });

  it('counts the words of the whole listening in the status bar', async () => {
    await h.session.handleSong();
    h.session.handleCaption(line('I reckon so.', 'Song A · Artist'));
    await h.session.handleSong();
    h.session.handleCaption(line('She is wary.', 'Song B · Artist'));
    expect(h.session.status().newWords).toBe(2);
  });

  it('keeps the buttons working on the cards of the previous song', async () => {
    await h.session.handleSong();
    h.session.handleCaption(line('I reckon so.', 'Song A · Artist'));
    await settle();
    await h.session.handleSong();
    expect(h.vocabulary.toggleSaved('reckon')).toBe(true);
  });

  it('opens the quiz of the last song that brought new words', async () => {
    await h.session.handleSong();
    h.session.handleCaption(line('I reckon so.', 'Song A · Artist'));
    await h.session.handleSong();
    h.session.handleCaption(line('The house is here.', 'Song B · Artist'));
    const a = h.repos.sessions.list().find(({ title }) => title === 'Song A · Artist')!;
    await expect(h.session.stop()).resolves.toBe(a.id);
  });

  it('opens the quiz of the song playing when it brought new words', async () => {
    await h.session.handleSong();
    h.session.handleCaption(line('I reckon so.', 'Song A · Artist'));
    await h.session.handleSong();
    h.session.handleCaption(line('She is wary.', 'Song B · Artist'));
    const b = h.repos.sessions.list().find(({ title }) => title === 'Song B · Artist')!;
    await expect(h.session.stop()).resolves.toBe(b.id);
  });

  it('takes the notice from Spotify instead of waiting for captions', () => {
    h.clock.now += 60_000;
    expect(h.session.status().notice).toBeNull();
    h.session.setSourceNotice('no_lyrics');
    expect(h.events.statuses.at(-1)?.notice).toBe('no_lyrics');
    h.session.setSourceNotice(null);
    expect(h.session.status().notice).toBeNull();
  });
});

describe('song changes outside Spotify', () => {
  it('are ignored by a browser session', async () => {
    h.session.start('browser');
    h.session.handleCaption(caption('I reckon so.'));
    await h.session.handleSong();
    h.session.handleCaption(caption('She is wary.'));
    expect(h.repos.sessions.list()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: ver falhar**

Run: `cd apps/desktop && node scripts/vitest-electron.mjs run src/main/services/session.test.ts -t "Spotify songs|outside Spotify"`
Expected: FAIL, `handleSong is not a function`.

- [ ] **Step 3: implementação no vocabulário**

Em `apps/desktop/src/main/services/vocabulary.ts`:

1. Novo campo depois de `private entries = new Map<string, Entry>();`:

```ts
  private retired = new Map<string, Entry>();
```

2. `begin` passa a receber a opção e a guardar os cards já mostrados antes de limpar:

```ts
  begin(options: { keepShown?: boolean } = {}): void {
    this.retired = options.keepShown
      ? new Map(
          [...this.entries.values()]
            .filter((entry) => entry.shownAt != null)
            .map((entry) => [entry.lemma, entry]),
        )
      : new Map();
    this.epoch += 1;
```

O resto do corpo de `begin` continua igual.

3. Método novo, ao lado de `toggleSaved`:

```ts
  private findEntry(lemma: string): Entry | undefined {
    return (
      [...this.entries.values()].find((item) => item.lemma === lemma) ?? this.retired.get(lemma)
    );
  }
```

4. Em `unmarkKnown` e em `toggleSaved`, troque
`[...this.entries.values()].find((item) => item.lemma === lemma)` por `this.findEntry(lemma)`.

- [ ] **Step 4: implementação na sessão**

Em `apps/desktop/src/main/services/session.ts`:

1. Import: acrescente `SessionNotice` ao `import type { … } from '@legendary/contracts'`.

2. Campos novos depois de `private track: CaptionTrack | null = null;`:

```ts
  private sourceNotice: SessionNotice | null = null;
  private earlierWords = 0;
  private lastSongWithWords: number | null = null;
  private rowStartedAt = 0;
  private switching: Promise<void> | null = null;
  private waiting: (() => void)[] = [];
```

3. Em `status()`, `newWords` passa a ser
`this.earlierWords + this.deps.vocabulary.newWords`.

4. Em `start()`, depois de `this.hadCaption = false;`:

```ts
    this.rowStartedAt = now;
    this.sourceNotice = null;
    this.earlierWords = 0;
    this.lastSongWithWords = null;
    this.switching = null;
    this.waiting = [];
```

e a linha do track vira `if (this.track && origin === 'browser') this.deps.vocabulary.useTrack(this.track.cues);`.

5. `handleCaption` espera a troca de música:

```ts
  handleCaption(caption: CaptionEvent): void {
    if (this.state !== 'active') return;
    if (this.switching) {
      this.waiting.push(() => this.handleCaption(caption));
      return;
    }
```

O resto continua igual.

6. `handleTrack`:

```ts
  handleTrack(track: CaptionTrack): void {
    if (this.switching) {
      this.waiting.push(() => this.handleTrack(track));
      return;
    }
    if (track.source !== 'spotify') this.track = track;
    if (this.state !== 'idle') this.deps.vocabulary.useTrack(track.cues);
  }
```

7. Métodos novos depois de `handleTrack`:

```ts
  handleSong(): Promise<void> {
    if (this.state === 'idle' || this.origin !== 'spotify') return Promise.resolve();
    const startedAt = this.deps.now();
    const switching = (this.switching ?? Promise.resolve()).then(() => this.closeSong(startedAt));
    this.switching = switching;
    return switching.then(() => {
      if (this.switching !== switching) return;
      this.switching = null;
      const waiting = this.waiting;
      this.waiting = [];
      waiting.forEach((run) => run());
    });
  }

  setSourceNotice(notice: SessionNotice | null): void {
    this.sourceNotice = notice;
    if (this.state !== 'idle') this.publish();
  }

  private async closeSong(startedAt: number) {
    const sessionId = this.sessionId;
    if (sessionId !== null) await this.flushWithLimit();
    const words = this.deps.vocabulary.newWords;
    if (sessionId !== null) {
      if (words > 0) this.lastSongWithWords = sessionId;
      this.deps.repos.sessions.end(sessionId, this.deps.now());
    }
    this.earlierWords += words;
    this.sessionId = null;
    this.title = null;
    this.rowStartedAt = startedAt;
    this.deps.vocabulary.begin({ keepShown: true });
    this.publish();
  }
```

8. `stop()`:

```ts
  async stop(): Promise<number | null> {
    if (this.state === 'idle') return null;
    await this.switching;
    const elapsed = this.elapsed();
    const newWords = this.deps.vocabulary.newWords;
    const sessionId = this.sessionId;

    await this.flushWithLimit();
    this.deps.vocabulary.end();
    if (sessionId !== null) {
      const endedAt = this.origin === 'spotify' ? this.deps.now() : this.startedAt + elapsed;
      this.deps.repos.sessions.end(sessionId, endedAt);
    }

    this.state = 'idle';
    this.watchedMs = 0;
    this.source = null;
    this.deps.vocabulary.begin();
    this.publish();
    const current = newWords > 0 ? sessionId : null;
    return current ?? (this.origin === 'spotify' ? this.lastSongWithWords : null);
  }
```

9. Em `ensureSession`, `startedAt: this.startedAt` vira `startedAt: this.rowStartedAt`.

10. Em `notice()`, depois da linha do `ai_error`:

```ts
    if (this.origin === 'spotify') return this.sourceNotice;
```

- [ ] **Step 5: ver passar**

Run: `cd apps/desktop && node scripts/vitest-electron.mjs run src/main/services`
Expected: PASS em todos os testes de serviço, novos e antigos.

- [ ] **Step 6: commit**

```bash
git add apps/desktop/src/main/services
git commit -m "feat(capture): keep one session per Spotify song"
```

---

### Task 7: mockup e telas

**Files:**
- Modify: `design/Legendary Mockups.dc.html` (frames 1c, 1d e 1j), `design/reference/{1c,1d,1j}.png`
- Modify: `apps/desktop/src/renderer/menu/MenuView.tsx`, `apps/desktop/src/renderer/menu/App.tsx`
- Modify: `apps/desktop/src/renderer/overlay/StatusBar.tsx`
- Modify: `apps/desktop/src/renderer/preview/frames.tsx`

**Interfaces:**
- Produces: `MenuViewProps.onPickOrigin?: (origin: CaptureOrigin) => void`.

- [ ] **Step 1: mockup local**

Em `design/Legendary Mockups.dc.html`:

1. Frame 1d: troque as duas linhas de origem (a do "Navegador" e a do "Áudio do sistema") por:

```html
    <div style="height:24px;padding:0 10px;border-radius:6px;display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.35)"><span style="width:12px">✓</span><span>Navegador</span><span style="color:rgba(255,255,255,.25)">Netflix, YouTube</span></div>
    <div style="height:24px;padding:0 10px;border-radius:6px;display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.35)"><span style="width:12px"></span><span>Spotify</span><span style="color:rgba(255,255,255,.25)">letras sincronizadas</span></div>
    <div style="height:24px;padding:0 10px;border-radius:6px;display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.35)"><span style="width:12px"></span><span>Áudio do sistema</span></div>
```

2. Frame 1c: logo depois do bloco "Erro de API / sem internet" (as duas linhas que terminam com
`· 3 palavras na fila</span></div></div>`), acrescente:

```html
    <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-start"><span style="font-size:11px;color:rgba(255,255,255,.55)">Spotify — música sem letra em inglês</span>
      <div style="display:flex;align-items:center;gap:10px;padding:6px 14px;height:26px;background:rgba(30,30,34,0.58);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border:1px solid rgba(255,255,255,0.13);border-radius:999px;font-size:12.5px"><span style="width:6px;height:6px;border-radius:50%;border:1.5px solid #FFB340"></span><span>Sem letra em inglês para esta música</span><span style="color:rgba(255,255,255,.5)">· esperando a próxima</span></div></div>
```

3. Frame 1j: na lista `Ontem` dos dados do histórico, entre "Northbound · T1E2" e
"How tides actually work", acrescente
`{ title: 'Man I Need · Olivia Dean', meta: 'Spotify · 3 min · 6 palavras', bg: 'transparent' }, `.

Depois: `pnpm --filter desktop design:capture`, e restaure com `git checkout` todo PNG em
`design/reference/` que mudou sem ser 1c, 1d ou 1j (a captura gera ruído nos outros). Abra os três
PNGs e confira o desenho.

- [ ] **Step 2: frames do preview (testes visuais que falham)**

Em `apps/desktop/src/renderer/preview/frames.tsx`:

1. No frame `'1c'`, depois do bloco de "Erro de API / sem internet":

```tsx
        <div className="flex flex-col items-start gap-1.5">
          <StateLabel>Spotify — música sem letra em inglês</StateLabel>
          <StatusBar status={status({ source: 'spotify', origin: 'spotify', notice: 'no_lyrics' })} />
        </div>
```

2. Em `history.sessions`, depois de `session(2, …)`:

```ts
    session(6, 'Man I Need · Olivia Dean', 'spotify', 1, 3, 6, null),
```

Run: `make test-visual`
Expected: FAIL em 1c, 1d e 1j (aviso, linha de origem e linha do histórico ainda sem código).

- [ ] **Step 3: implementação das telas**

`apps/desktop/src/renderer/menu/MenuView.tsx`:

1. Em `MenuViewProps`, acrescente `onPickOrigin?: (origin: CaptureOrigin) => void;`.

2. Componente novo depois de `Separator`:

```tsx
function OriginRow({
  checked,
  disabled,
  hint,
  onClick,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Row disabled={disabled} onClick={onClick}>
      <span className="w-3">{checked ? '✓' : ''}</span>
      <span>{children}</span>
      {hint && <span className={disabled ? 'text-white/25' : 'text-white/45'}>{hint}</span>}
    </Row>
  );
}
```

3. As linhas da seção Origem viram:

```tsx
      <OriginRow
        checked={origin === 'browser'}
        disabled={!idle}
        hint="Netflix, YouTube"
        onClick={() => props.onPickOrigin?.('browser')}
      >
        Navegador
      </OriginRow>
      <OriginRow
        checked={origin === 'spotify'}
        disabled={!idle}
        hint="letras sincronizadas"
        onClick={() => props.onPickOrigin?.('spotify')}
      >
        Spotify
      </OriginRow>
      <OriginRow checked={origin === 'audio'} disabled>
        Áudio do sistema
      </OriginRow>
```

`apps/desktop/src/renderer/menu/App.tsx`: passe ao `MenuView`

```tsx
        onPickOrigin={(next) => void api().invoke('settings:set', { origin: next })}
```

O menu continua aberto depois da escolha, e o ✓ muda pelo evento `settings:changed`.

`apps/desktop/src/renderer/overlay/StatusBar.tsx`:

1. Depois de `wordsLabel`:

```tsx
const SPOTIFY_NOTICES: Partial<
  Record<NonNullable<SessionStatus['notice']>, { text: string; detail: string; waiting: boolean }>
> = {
  spotify_waiting: { text: 'Abra o Spotify e dê play', detail: 'esperando…', waiting: true },
  spotify_denied: { text: 'Libere o controle do Spotify', detail: 'Ajustes › Automação', waiting: false },
  no_lyrics: { text: 'Sem letra em inglês para esta música', detail: 'esperando a próxima', waiting: true },
};
```

2. Depois do bloco de `ai_error`:

```tsx
  const spotifyNotice = status.notice ? SPOTIFY_NOTICES[status.notice] : undefined;
  if (spotifyNotice) {
    return (
      <Glass className={`${PILL} h-[26px] gap-2.5 px-3.5 py-1.5`}>
        <span
          className={
            spotifyNotice.waiting
              ? 'size-1.5 rounded-full border-[1.5px] border-warn'
              : 'size-2 rounded-full bg-warn'
          }
        />
        <span>{spotifyNotice.text}</span>
        <span className="text-white/50">· {spotifyNotice.detail}</span>
      </Glass>
    );
  }
```

3. O rótulo da direita na sessão ativa:

```tsx
        {status.source
          ? sourceLabel(status.source)
          : status.origin === 'spotify'
            ? sourceLabel('spotify')
            : 'Navegador'}
```

- [ ] **Step 4: ver passar**

Run: `pnpm prettier --write apps/desktop/src && pnpm -r typecheck && pnpm -r lint && make test-visual`
Expected: os 15 frames passam.

- [ ] **Step 5: commit**

```bash
git add design apps/desktop/src/renderer
git commit -m "feat(overlay): show the Spotify origin, its notices and its sessions"
```

---

### Task 8: ligação no main e E2E

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/e2e/spotify.spec.ts`
- Modify: `apps/desktop/e2e/playwright.config.ts`

**Interfaces:**
- Consumes: `SpotifySource`, `SpotifyNotice` (Task 5), `AppleScriptPlayer`, `SpotifyState`
  (Task 3), `LrclibClient` (Task 4), `FakeSpotifyPlayer`, `FakeLyricsClient`, `E2E_SONGS`
  (Tasks 3 e 4), `SessionService.handleSong` e `setSourceNotice` (Task 6).

- [ ] **Step 1: E2E que falha**

Em `apps/desktop/e2e/playwright.config.ts`:
`testMatch: ['app.spec.ts', 'extension.spec.ts', 'spotify.spec.ts'],`

`apps/desktop/e2e/spotify.spec.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

const WS_PORT = 47693;

let app: ElectronApplication;
let userData: string;

type LooseApi = { legendary: { invoke(channel: string, payload: unknown): Promise<unknown> } };

const invoke = (page: Page, channel: string, payload?: unknown) =>
  page.evaluate(([name, body]) => (window as never as LooseApi).legendary.invoke(name, body), [
    channel,
    payload,
  ] as const);

async function windowOf(page: string): Promise<Page> {
  await expect
    .poll(() => app.windows().some((window) => window.url().includes(`/${page}/`)), {
      timeout: 20_000,
    })
    .toBe(true);
  return app.windows().find((window) => window.url().includes(`/${page}/`))!;
}

const play = (state: object) =>
  app.evaluate(({ app: electronApp }, payload) => {
    electronApp.emit('legendary:spotify' as never, payload);
  }, state);

const track = (id: string, name: string) => ({
  kind: 'track',
  id,
  name,
  artist: 'The Fakes',
  album: 'Fakes',
  durationMs: 180_000,
  positionS: 0,
  playing: true,
});

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'legendary-spotify-'));
  const { ELECTRON_RUN_AS_NODE, ...inherited } = process.env as Record<string, string>;
  app = await electron.launch({
    args: ['.'],
    cwd: resolve(import.meta.dirname, '..'),
    env: {
      ...inherited,
      LEGENDARY_E2E: '1',
      LEGENDARY_USER_DATA: userData,
      LEGENDARY_WS_PORT: String(WS_PORT),
    },
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

test('Spotify lyrics become cards, one session per song, with the quiz of the last song', async () => {
  const menu = await windowOf('menu');
  const overlay = await windowOf('overlay');
  const bar = overlay.getByTestId('status-bar');
  await invoke(menu, 'settings:set', { onboarded: true, cardsPerMinute: 15, cardsAtOnce: 3 });
  const origin = async () =>
    ((await invoke(menu, 'settings:get')) as { settings: { origin: string } }).settings.origin;

  await menu.getByRole('button', { name: /Spotify/ }).click();
  await expect.poll(origin).toBe('spotify');
  await invoke(menu, 'session:start', { source: 'spotify' });
  await expect(menu.getByRole('button', { name: /Navegador/ })).toBeDisabled();
  await expect(bar).toContainText('Abra o Spotify e dê play');

  await play({ kind: 'denied' });
  await expect(bar).toContainText('Libere o controle do Spotify');

  await play(track('spotify:track:1', 'Northern Hunch'));
  await expect(overlay.getByTestId('card-hunch')).toBeVisible({ timeout: 10_000 });
  await expect(overlay.getByTestId('card-grumpy')).toBeVisible({ timeout: 10_000 });
  await expect(bar).toContainText('Encerrar');
  await expect(bar).toContainText('Spotify');

  await play(track('spotify:track:2', 'No Words'));
  await expect(bar).toContainText('Sem letra em inglês para esta música');

  await play(track('spotify:track:3', 'Wary Heart'));
  await expect(overlay.getByTestId('card-wary')).toBeVisible({ timeout: 10_000 });

  const quizOpened = app.waitForEvent('window', (window) => window.url().includes('/quiz/'));
  await invoke(menu, 'session:stop');
  const quiz = await quizOpened;
  const sessionId = Number(new URL(quiz.url()).searchParams.get('sessionId'));
  const list = (await invoke(menu, 'history:list')) as {
    sessions: { id: number; title: string; source: string }[];
  };
  expect(list.sessions.map(({ title }) => title)).toEqual([
    'Wary Heart · The Fakes',
    'Northern Hunch · The Fakes',
  ]);
  expect(list.sessions[0]).toMatchObject({ id: sessionId, source: 'spotify' });
  await expect(menu.getByRole('button', { name: /Navegador/ })).toBeEnabled();
  await menu.getByRole('button', { name: /Navegador/ }).click();
  await expect.poll(origin).toBe('browser');
});
```

Run: `pnpm --filter desktop build && cd apps/desktop && npx playwright test --config e2e/playwright.config.ts e2e/spotify.spec.ts`
Expected: FAIL. Nenhum aviso aparece, porque o `SpotifySource` ainda não está ligado.

- [ ] **Step 2: implementação**

Em `apps/desktop/src/main/index.ts`:

1. Imports:

```ts
import type { CaptionEvent, CaptionTrack, CaptureOrigin, Provider, SettingsView } from '@legendary/contracts';
import { E2E_SONGS, FakeLyricsClient, FakeSpotifyPlayer } from './capture/spotify/fakes';
import { LrclibClient } from './capture/spotify/lyrics';
import { AppleScriptPlayer, type SpotifyState } from './capture/spotify/player';
import { SpotifySource, type SpotifyNotice } from './capture/spotify/source';
```

2. Depois de `const history = new HistoryService({ repos, now });`:

```ts
  const fakeSpotify = new FakeSpotifyPlayer(now);
  const spotify = new SpotifySource({
    player: isE2E ? fakeSpotify : new AppleScriptPlayer(),
    lyrics: isE2E
      ? new FakeLyricsClient(E2E_SONGS)
      : new LrclibClient({ userAgent: `Legendary/${app.getVersion()}` }),
    ranks: lexicon.ranks,
    now,
  });
  spotify.on('song', () => void session.handleSong());
  spotify.on('track', (track: CaptionTrack) => session.handleTrack(track));
  spotify.on('caption', (caption: CaptionEvent) => session.handleCaption(caption));
  spotify.on('notice', (notice: SpotifyNotice | null) => session.setSourceNotice(notice));
  if (isE2E) {
    app.on(
      'legendary:spotify' as never,
      ((state: SpotifyState) => fakeSpotify.set(state)) as never,
    );
  }
```

3. Início e fim de sessão passam pelo Spotify:

```ts
  const startSession = (origin: CaptureOrigin) => {
    session.start(origin);
    if (origin === 'spotify') spotify.start();
  };
  const stopSession = async () => {
    spotify.stop();
    const sessionId = await session.stop();
    if (sessionId !== null) openQuizWindow(sessionId, { triage: true });
  };
  const toggleSession = () => {
    if (session.status().state === 'idle') startSession(settings.get().origin);
    else session.togglePause();
  };
```

substituindo as versões atuais de `stopSession` e `toggleSession`, e no `registerHandlers`:
`'session:start': ({ source: origin }) => startSession(origin),`.

4. No `will-quit`, acrescente `spotify.stop();`.

- [ ] **Step 3: ver passar**

Run: `make test-e2e`
Expected: PASS em todos os E2E, inclusive `spotify.spec.ts`.

- [ ] **Step 4: commit**

```bash
git add apps/desktop/src/main/index.ts apps/desktop/e2e
git commit -m "feat(capture): start the Spotify lyrics with a Spotify session"
```

---

### Task 9: permissão de AppleScript no app empacotado

**Files:**
- Create: `apps/desktop/build/entitlements.mac.plist`
- Modify: `apps/desktop/electron-builder.yml`

- [ ] **Step 1: arquivos**

`apps/desktop/build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.automation.apple-events</key>
    <true/>
  </dict>
</plist>
```

Em `apps/desktop/electron-builder.yml`, dentro de `mac:`:

```yaml
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    LSUIElement: true
    NSAppleEventsUsageDescription: O Legendary lê a música que está tocando no Spotify para mostrar a letra.
```

- [ ] **Step 2: conferir**

Run: `plutil -lint apps/desktop/build/entitlements.mac.plist`
Expected: `OK`.

Run: `pnpm --filter desktop build && cd apps/desktop && npx electron-builder --mac --dir -c.mac.identity=null -c.mac.notarize=false`
e depois `plutil -p apps/desktop/dist/mac-arm64/Legendary.app/Contents/Info.plist | grep NSAppleEvents`
Expected: a linha com o texto do pedido de permissão. Apague `apps/desktop/dist` depois.

- [ ] **Step 3: commit**

```bash
git add apps/desktop/build/entitlements.mac.plist apps/desktop/electron-builder.yml
git commit -m "build: let the packaged app ask to control Spotify"
```

---

### Task 10: Claude Design e verificação final

- [ ] **Step 1:** Envie `design/Legendary Mockups.dc.html` ao projeto do Claude Design
  (`176db64f-20f3-4236-b34e-22baf21ccdf1`). Antes, leia o remoto e confira que ele é igual a
  `git show a51fc3c:"design/Legendary Mockups.dc.html"`, a versão anterior à Task 7 (etag esperado
  `1795481093539556`). Depois, use
  `get_claude_design_prompt`, `finalize_plan` e `write_files` com `if_match`, e leia de volta para
  conferir o SHA-256.
- [ ] **Step 2:** `make test`, `pnpm -r typecheck`, `pnpm -r lint`, `make test-visual` e
  `make test-e2e`, todos passando.
- [ ] **Step 3:** Olhe a janela real: print do menu com a origem Spotify e da barra de status com um
  aviso, tirados durante o E2E e removidos do teste depois.
- [ ] **Step 4:** Peça ao usuário o teste real: `make dev`, escolher "Spotify" no menu, dar play numa
  música em inglês e aceitar o pedido de permissão do macOS.
