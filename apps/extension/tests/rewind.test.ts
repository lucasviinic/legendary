import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rewindPlayer } from '../lib/rewind';

type WithNetflix = { netflix?: unknown };

function fakeNetflix(currentMs: number) {
  const player = { getCurrentTime: () => currentMs, seek: vi.fn() };
  const players: Record<string, typeof player> = { 'watch-abc': player };
  (window as WithNetflix).netflix = {
    appContext: {
      state: {
        playerApp: {
          getAPI: () => ({
            videoPlayer: {
              getAllPlayerSessionIds: () => ['motion-billboard-1', 'watch-abc'],
              getVideoPlayerBySessionId: (id: string) => players[id],
            },
          }),
        },
      },
    },
  };
  return player;
}

function addVideo(currentTime: number) {
  document.body.innerHTML = '<video></video>';
  const video = document.querySelector('video')!;
  video.currentTime = currentTime;
  return video;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  delete (window as WithNetflix).netflix;
});

describe('rewindPlayer on YouTube', () => {
  it('moves the video back', () => {
    const video = addVideo(100);
    rewindPlayer('youtube', 10);
    expect(video.currentTime).toBe(90);
  });

  it('stops at the start of the video', () => {
    const video = addVideo(4);
    rewindPlayer('youtube', 10);
    expect(video.currentTime).toBe(0);
  });

  it('does nothing on a page without a video', () => {
    expect(() => rewindPlayer('youtube', 10)).not.toThrow();
  });
});

describe('rewindPlayer on Netflix', () => {
  it('seeks through the player, in milliseconds', () => {
    const player = fakeNetflix(100_000);
    rewindPlayer('netflix', 10);
    expect(player.seek).toHaveBeenCalledWith(90_000);
  });

  it('stops at the start of the video', () => {
    const player = fakeNetflix(4_000);
    rewindPlayer('netflix', 10);
    expect(player.seek).toHaveBeenCalledWith(0);
  });

  it('never touches the video element, which would crash the player', () => {
    const video = addVideo(100);
    rewindPlayer('netflix', 10);
    expect(video.currentTime).toBe(100);

    fakeNetflix(100_000);
    rewindPlayer('netflix', 10);
    expect(video.currentTime).toBe(100);
  });
});

describe('rewindPlayer inside the page', () => {
  it('needs nothing from outside the function, because only its text gets there', () => {
    const copy = new Function(`return (${rewindPlayer.toString()})`)() as typeof rewindPlayer;
    const video = addVideo(100);
    copy('youtube', 10);
    expect(video.currentTime).toBe(90);

    const player = fakeNetflix(100_000);
    copy('netflix', 10);
    expect(player.seek).toHaveBeenCalledWith(90_000);
  });
});
