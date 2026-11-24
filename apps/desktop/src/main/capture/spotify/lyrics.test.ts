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
