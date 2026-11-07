import { z } from 'zod';

export const SourceSchema = z.enum(['netflix', 'youtube', 'audio']);
export type Source = z.infer<typeof SourceSchema>;

/** De onde a pessoa escolheu capturar: o menu oferece navegador ou áudio do sistema. */
export const CaptureOriginSchema = z.enum(['browser', 'audio']);
export type CaptureOrigin = z.infer<typeof CaptureOriginSchema>;

export const ProviderSchema = z.enum(['gemini', 'claude', 'deepseek']);
export type Provider = z.infer<typeof ProviderSchema>;

export const LevelSchema = z.enum(['B1', 'B2', 'C1']);
export type Level = z.infer<typeof LevelSchema>;

export const CefrSchema = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
export type Cefr = z.infer<typeof CefrSchema>;

export const CornerSchema = z.enum(['tl', 'tr', 'bl', 'br']);
export type Corner = z.infer<typeof CornerSchema>;

/** Onde a pilha de cards fica: o canto e a distância, em pixels, das bordas desse canto. */
export const CardPlacementSchema = z.object({
  corner: CornerSchema,
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});
export type CardPlacement = z.infer<typeof CardPlacementSchema>;
