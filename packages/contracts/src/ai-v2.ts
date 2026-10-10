import { z } from 'zod';

import {
  aiProbeV1SuccessSchema,
  aiProviderIds,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
} from './ai-v1.ts';

export const aiRecommendV2Path = '/v2/ai/recommend' as const;
export const aiProbeV2Path = '/v2/ai/probe' as const;
export const styleAesthetics = ['minimal', 'classic', 'sporty', 'streetwear', 'relaxed'] as const;
export const styleAestheticSchema = z.enum(styleAesthetics);

export const styleAestheticsLimit = 3;
export const styleAestheticsSchema = z.array(styleAestheticSchema).max(styleAestheticsLimit).refine(
  (values) => values.every((value, index) => index === 0 || values[index - 1] < value),
  'Style aesthetics must be sorted and unique.',
);

export const aiRecommendV2RequestSchema = aiRecommendV1RequestSchema.safeExtend({
  locale: z.enum(['tr', 'en']),
  styleAesthetics: styleAestheticsSchema.optional(),
  // Present only on a confirmed "Ask the stylist again": the Worker then neither reads nor
  // writes its shared cache. Absent, as every installed binary sends it, nothing changes.
  // It never reaches the model input or the shared cache key.
  reask: z.literal(true).optional(),
});

// A decimal point between digits is a measurement, not a sentence terminator.
// Other periods, exclamation marks and question marks may appear only at the end.
function isOneSentence(sentence: string): boolean {
  return /^[^.!?\r\n]+[.!?]?$/u.test(sentence.replace(/(\d)\.(\d)/gu, '$1$2'));
}

// Turkish and English are both Latin script, so a letter from any other script is a model
// slipping language mid-sentence; a comma, semicolon or colon at the end, or before the final mark, is a cut clause.
export const insightSentenceSchema = z.string().min(1).max(90).refine(
  (sentence) => sentence === sentence.trim() && isOneSentence(sentence)
    && !/(?!\p{Script=Latin})\p{L}/u.test(sentence) && !/[,;:][.!?]?$/u.test(sentence),
  'Insight must be one trimmed Latin-script sentence without a line break or a cut clause.',
);

export const aiRecommendV2SuccessSchema = aiRecommendV1SuccessSchema.safeExtend({
  data: aiRecommendV1SuccessSchema.shape.data.safeExtend({
    insightSentence: insightSentenceSchema.optional(),
  }),
});

// The v1 probe answers only the ids installed binaries parse; v2 also names the paid
// provider that leads the chain.
export const aiProbeV2ProviderIds = [...aiProviderIds, 'haiku'] as const;

const aiProbeV1Data = aiProbeV1SuccessSchema.shape.data;

// `extend`, not `safeExtend`: the id enum is widened, which `safeExtend` refuses.
export const aiProbeV2SuccessSchema = aiProbeV1SuccessSchema.extend({
  data: aiProbeV1Data.extend({
    assistant: aiProbeV1Data.shape.assistant.unwrap().extend({
      providerId: z.enum(aiProbeV2ProviderIds),
    }).optional(),
  }),
});

export type StyleAesthetic = z.infer<typeof styleAestheticSchema>;
export type AiRecommendV2Request = z.infer<typeof aiRecommendV2RequestSchema>;
export type AiRecommendV2Success = z.infer<typeof aiRecommendV2SuccessSchema>;
export type AiProbeV2Success = z.infer<typeof aiProbeV2SuccessSchema>;
export type AiProbeV2ProviderId = (typeof aiProbeV2ProviderIds)[number];
