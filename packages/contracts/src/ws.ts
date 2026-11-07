import { z } from 'zod';
import { CaptionEventSchema } from './caption';

export const DEFAULT_WS_PORT = 47615;

/** Mensagens da extensão para o app. */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('caption'), caption: CaptionEventSchema }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Mensagens do app para a extensão. */
export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('highlight'),
    text: z.string(),
    surfaces: z.array(z.string()),
  }),
  z.object({ type: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
