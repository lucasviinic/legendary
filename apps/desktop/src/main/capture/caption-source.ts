import type { CaptionEvent } from '@legendary/contracts';

/** Fonte de legendas. Trocar a extensão pelo áudio é trocar a implementação desta interface. */
export interface CaptionSource {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  on(event: 'caption', listener: (caption: CaptionEvent) => void): unknown;
}
