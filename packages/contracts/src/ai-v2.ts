import { z } from 'zod';

import {
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
} from './ai-v1.ts';

export const aiRecommendV2Path = '/v2/ai/recommend' as const;
export const styleAesthetics = ['minimal', 'classic', 'sporty', 'streetwear', 'relaxed'] as const;
export const styleAestheticSchema = z.enum(styleAesthetics);

const styleAestheticsSchema = z.array(styleAestheticSchema).max(3).refine(
  (values) => values.every((value, index) => index === 0 || values[index - 1] < value),
  'Style aesthetics must be sorted and unique.',
);

export const aiRecommendV2RequestSchema = aiRecommendV1RequestSchema.safeExtend({
  locale: z.enum(['tr', 'en']),
  styleAesthetics: styleAestheticsSchema.optional(),
});

// A decimal point between digits is a measurement, not a sentence terminator.
// Other periods, exclamation marks and question marks may appear only at the end.
function isOneSentence(sentence: string): boolean {
  return /^[^.!?\r\n]+[.!?]?$/u.test(sentence.replace(/(\d)\.(\d)/gu, '$1$2'));
}

export const insightSentenceSchema = z.string().min(1).max(90).refine(
  (sentence) => sentence === sentence.trim() && isOneSentence(sentence),
  'Insight must be one trimmed sentence without a line break.',
);

export const aiRecommendV2SuccessSchema = aiRecommendV1SuccessSchema.safeExtend({
  data: aiRecommendV1SuccessSchema.shape.data.safeExtend({
    insightSentence: insightSentenceSchema.optional(),
  }),
});

export type StyleAesthetic = z.infer<typeof styleAestheticSchema>;
export type AiRecommendV2Request = z.infer<typeof aiRecommendV2RequestSchema>;
export type AiRecommendV2Success = z.infer<typeof aiRecommendV2SuccessSchema>;
