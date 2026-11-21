import type { CaptionEvent, CaptionTrack } from '@legendary/contracts';
import type { HighlightMessage } from './connection';

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
