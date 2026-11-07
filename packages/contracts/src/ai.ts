import { z } from 'zod';
import { CefrSchema } from './common';

export const EnrichRequestWordSchema = z.object({
  lemma: z.string(),
  pos: z.string(),
  surface: z.string(),
  sentence: z.string(),
});
export type EnrichRequestWord = z.infer<typeof EnrichRequestWordSchema>;

export const EnrichedWordSchema = z.object({
  lemma: z.string(),
  pos: z.string(),
  translation: z.string().min(1),
  explanation: z.string().min(1),
  exampleEn: z.string().min(1),
  examplePt: z.string().min(1),
  cefr: CefrSchema,
});
export type EnrichedWord = z.infer<typeof EnrichedWordSchema>;

export const EnrichResponseSchema = z.object({ words: z.array(EnrichedWordSchema) });

export const QuestionTypeSchema = z.enum([
  'mc_en_pt',
  'mc_pt_en',
  'cloze',
  'context_sense',
  'match',
  'true_false',
  'type_word',
]);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

export const MatchPairSchema = z.object({ word: z.string(), meaning: z.string() });
export type MatchPair = z.infer<typeof MatchPairSchema>;

/**
 * Formato fechado das questões. É plano, com campos anuláveis, porque os três provedores aceitam
 * esse formato em saída estruturada, o que não vale para uniões discriminadas.
 */
export const QuizQuestionDraftSchema = z.object({
  word: z.string(),
  type: QuestionTypeSchema,
  prompt: z.string().min(1),
  options: z.array(z.string()).nullable(),
  answer: z.string(),
  explanation: z.string(),
  pairs: z.array(MatchPairSchema).nullable(),
});
export type QuizQuestionDraft = z.infer<typeof QuizQuestionDraftSchema>;

export const QuizResponseSchema = z.object({ questions: z.array(QuizQuestionDraftSchema) });
