import { z } from 'zod';
import { SourceSchema } from './common';

export const CaptionEventSchema = z.object({
  text: z.string().min(1).max(2000),
  startedAt: z.number().int().nonnegative(),
  source: SourceSchema,
  mediaTitle: z.string().max(300).optional(),
});
export type CaptionEvent = z.infer<typeof CaptionEventSchema>;
