import { z } from 'zod';
import { CaptionEventSchema, CaptionTrackSchema } from './caption';

export const DEFAULT_WS_PORT = 47615;

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('caption'), caption: CaptionEventSchema }),
  z.object({ type: z.literal('track'), track: CaptionTrackSchema }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('open-search') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('highlight'),
    text: z.string(),
    surfaces: z.array(z.string()),
  }),
  z.object({ type: z.literal('rewind'), seconds: z.number().positive() }),
  z.object({ type: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
