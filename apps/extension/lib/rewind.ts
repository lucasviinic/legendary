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

/**
 * Volta o vídeo. Esta função roda dentro da página e só o texto dela chega lá, então ela não pode
 * usar nada de fora.
 *
 * Mudar o `currentTime` derruba o player da Netflix, por isso lá só serve a API interna dele, a
 * mesma que o Firefox usa no Picture-in-Picture. Se a Netflix mudar essa API, o erro para aqui e o
 * vídeo só não volta.
 */
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
