import { z } from 'zod';
import { SourceSchema } from './common';

export const WindowBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type WindowBounds = z.infer<typeof WindowBoundsSchema>;

export const CaptionEventSchema = z.object({
  text: z.string().min(1).max(2000),
  startedAt: z.number().int().nonnegative(),
  source: SourceSchema,
  mediaTitle: z.string().max(300).optional(),
  bounds: WindowBoundsSchema.optional(),
});
export type CaptionEvent = z.infer<typeof CaptionEventSchema>;

export const MAX_TRACK_CUES = 10_000;

export const CaptionTrackSchema = z.object({
  source: SourceSchema,
  cues: z.array(z.string().min(1).max(2000)).min(1).max(MAX_TRACK_CUES),
});
export type CaptionTrack = z.infer<typeof CaptionTrackSchema>;
