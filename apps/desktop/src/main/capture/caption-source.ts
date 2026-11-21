import type { CaptionEvent } from '@legendary/contracts';

export interface CaptionSource {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  on(event: 'caption', listener: (caption: CaptionEvent) => void): unknown;
}
