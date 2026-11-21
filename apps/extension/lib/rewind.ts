import type { Source } from '@legendary/contracts';

interface NetflixPlayer {
  getCurrentTime(): number;
  seek(milliseconds: number): void;
}

interface NetflixPage {
  netflix: {
    appContext: {
      state: {
        playerApp: {
          getAPI(): {
            videoPlayer: {
              getAllPlayerSessionIds(): string[];
              getVideoPlayerBySessionId(id: string): NetflixPlayer;
            };
          };
        };
      };
    };
  };
}

export function rewindPlayer(source: Source, seconds: number): void {
  if (source === 'netflix') {
    const page = window as unknown as Partial<NetflixPage>;
    const api = page.netflix?.appContext.state.playerApp.getAPI().videoPlayer;
    const session = api?.getAllPlayerSessionIds().find((id) => id.startsWith('watch-'));
    if (!api || !session) return;
    const player = api.getVideoPlayerBySessionId(session);
    player.seek(Math.max(0, player.getCurrentTime() - seconds * 1000));
    return;
  }
  const video = document.querySelector('video');
  if (video) video.currentTime = Math.max(0, video.currentTime - seconds);
}
