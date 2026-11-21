import type { CaptionEvent, CaptionTrack } from '@legendary/contracts';
import type { HighlightMessage } from './connection';

/** Mensagens internas da extensão, entre o content script, o popup e o background. */
export type RuntimeMessage =
  | { type: 'caption'; caption: CaptionEvent }
  | { type: 'track'; track: CaptionTrack }
  | { type: 'status' }
  | { type: 'open-search' };

export interface StatusReply {
  connected: boolean;
  queued: number;
}

export type TabMessage = HighlightMessage;
