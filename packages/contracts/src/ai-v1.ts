import { z } from 'zod';

export const aiRecommendV1Path = '/v1/ai/recommend' as const;
export const healthV1Path = '/v1/health' as const;
export const aiReadyV1Path = '/v1/ai/ready' as const;

export const garmentTypeIds = [
  't_shirt',
  'long_sleeve_t_shirt',
  'shirt',
  'blouse',
  'sweatshirt',
  'hoodie',
  'sweater',
  'cardigan',
  'overshirt',
  'trousers',
  'jeans',
  'shorts',
  'skirt',
  'dress',
  'jumpsuit',
  'light_jacket',
  'trench_coat',
  'rain_jacket',
  'insulated_jacket',
  'coat',
  'sneakers',
  'closed_shoes',
  'ankle_boots',
  'weather_boots',
  'sandals',
  'beanie',
  'brimmed_hat',
  'scarf',
  'gloves',
  'umbrella',
] as const;

export const structuralCategories = [
  'top',
  'bottom',
  'one_piece',
  'outerwear',
  'footwear',
  'accessory',
] as const;

export const layerRoles = ['base', 'mid', 'outer', 'standalone'] as const;
export const bodyRegions = [
  'upper_body',
  'lower_body',
  'full_body',
  'feet',
  'head',
  'neck',
  'hands',
] as const;
export const thermalLevels = ['none', 'light', 'moderate', 'high'] as const;
export const waterProtections = [
  'none',
  'water_resistant',
  'waterproof',
] as const;
export const windProtections = ['none', 'wind_resistant'] as const;
export const breathabilityLevels = ['low', 'moderate', 'high'] as const;
export const coverageLevels = ['none', 'partial', 'full'] as const;
export const tractionSuitabilities = ['everyday', 'enhanced'] as const;
export const colorFamilies = [
  'black',
  'white',
  'gray',
  'brown',
  'beige',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'multicolor',
] as const;
export const clothingPreferences = ['womens', 'mens'] as const;
export const clothingRequirementReasonCodes = [
  'temperature_low',
  'apparent_temperature_low',
  'temperature_high',
  'apparent_temperature_high',
  'daily_range_wide',
  'daily_extrema_fallback',
  'wind_elevated',
  'wind_strong',
  'precipitation_possible',
  'precipitation_likely',
  'condition_drizzle',
  'condition_rain',
  'condition_heavy_rain',
  'condition_sleet',
  'condition_snow',
  'condition_thunderstorm',
] as const;
export const clothingRequirementPriorities = ['mandatory', 'optional'] as const;
export const outfitSlots = [
  'primary_top',
  'bottom',
  'one_piece',
  'mid_layer',
  'outer_layer',
  'footwear',
] as const;

export const aiV1ErrorCodes = [
  'invalid_request',
  'not_found',
  'method_not_allowed',
  'ai_unavailable',
  'internal_error',
] as const;

// Measured worst case: 494 bytes per candidate; 128 candidates total 66,983 bytes.
// Lowered to 125 (65,498 bytes): a provider-neutral transport/prompt-size budget, not a token count or model limit.
export const aiV1CandidateLimit = 125;

const candidateKeySchema = z.string().regex(/^[A-Za-z0-9:_-]{1,64}$/);
const prioritySchema = z.enum(clothingRequirementPriorities);
const reasonCodesSchema = z
  .array(z.enum(clothingRequirementReasonCodes))
  .min(1)
  .max(16);

const requirementBase = {
  priority: prioritySchema,
  reasonCodes: reasonCodesSchema,
} as const;

export const clothingRequirementSchema = z.discriminatedUnion('kind', [
  z.object({
    ...requirementBase,
    kind: z.literal('thermal'),
    minimum: z.enum(['light', 'moderate', 'high']),
  }).strict(),
  z.object({
    ...requirementBase,
    kind: z.literal('breathability'),
    minimum: z.enum(breathabilityLevels),
  }).strict(),
  z.object({
    ...requirementBase,
    kind: z.literal('arm_coverage'),
    minimum: z.enum(['partial', 'full']),
  }).strict(),
  z.object({
    ...requirementBase,
    kind: z.literal('leg_coverage'),
    minimum: z.enum(['partial', 'full']),
  }).strict(),
  z.object({
    ...requirementBase,
    kind: z.literal('water_protection'),
    minimum: z.enum(['water_resistant', 'waterproof']),
    target: z.enum(['body', 'feet']),
  }).strict(),
  z.object({
    ...requirementBase,
    kind: z.literal('wind_protection'),
    minimum: z.enum(['wind_resistant']),
  }).strict(),
  z.object({
    ...requirementBase,
    kind: z.literal('traction'),
    minimum: z.enum(['enhanced']),
  }).strict(),
]);

export const aiCandidateSchema = z.object({
  candidateKey: candidateKeySchema,
  source: z.enum(['catalog', 'wardrobe']),
  garmentTypeId: z.enum(garmentTypeIds),
  colorFamily: z.enum(colorFamilies).nullable(),
  properties: z.object({
    category: z.enum(structuralCategories),
    bodyRegion: z.enum(bodyRegions).nullable(),
    supportedLayerRoles: z.array(z.enum(layerRoles)).min(1).max(4),
    thermalLevel: z.enum(thermalLevels).nullable(),
    waterProtection: z.enum(waterProtections).nullable(),
    windProtection: z.enum(windProtections).nullable(),
    breathability: z.enum(breathabilityLevels).nullable(),
    armCoverage: z.enum(coverageLevels).nullable(),
    legCoverage: z.enum(coverageLevels).nullable(),
    tractionSuitability: z.enum(tractionSuitabilities).nullable(),
  }).strict(),
}).strict();

export const aiRecommendV1RequestSchema = z.object({
  clothingPreference: z.enum(clothingPreferences),
  requirements: z.array(clothingRequirementSchema).min(1).max(8),
  candidates: z.array(aiCandidateSchema).min(1).max(aiV1CandidateLimit),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  value.candidates.forEach(({ candidateKey }, index) => {
    if (seen.has(candidateKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Candidate keys must be unique.',
        path: ['candidates', index, 'candidateKey'],
      });
    }
    seen.add(candidateKey);
  });
});

export const aiOutfitGarmentSchema = z.object({
  slot: z.enum(outfitSlots),
  layerRole: z.enum(layerRoles).nullable(),
  candidateKey: candidateKeySchema,
}).strict();

export const aiOutfitSchema = z.array(aiOutfitGarmentSchema).min(2).max(5)
  .superRefine((outfit, context) => {
    const candidateKeys = new Set<string>();
    const slots = new Set<(typeof outfitSlots)[number]>();
    outfit.forEach(({ candidateKey, slot }, index) => {
      if (candidateKeys.has(candidateKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Candidate keys must be unique within an outfit.',
          path: [index, 'candidateKey'],
        });
      }
      if (slots.has(slot)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Slots must be unique within an outfit.',
          path: [index, 'slot'],
        });
      }
      candidateKeys.add(candidateKey);
      slots.add(slot);
    });

    const slotCount = (slot: (typeof outfitSlots)[number]): number =>
      outfit.filter((garment) => garment.slot === slot).length;
    if (slotCount('footwear') !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An outfit must contain exactly one footwear slot.',
        path: [],
      });
    }

    const primaryTopCount = slotCount('primary_top');
    const bottomCount = slotCount('bottom');
    const onePieceCount = slotCount('one_piece');
    const hasValidBodyCore = onePieceCount === 1
      ? primaryTopCount === 0 && bottomCount === 0
      : onePieceCount === 0 && primaryTopCount === 1 && bottomCount === 1;
    if (!hasValidBodyCore) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An outfit must contain exactly one complete body core.',
        path: [],
      });
    }

    for (const slot of ['mid_layer', 'outer_layer'] as const) {
      if (slotCount(slot) > 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `An outfit may contain at most one ${slot}.`,
          path: [],
        });
      }
    }
  });

export const aiRecommendV1SuccessSchema = z.object({
  data: z.object({
    outfits: z.array(aiOutfitSchema).length(3),
  }).strict(),
}).strict();

export const aiV1ErrorSchema = z.object({
  error: z.object({
    code: z.enum(aiV1ErrorCodes),
  }).strict(),
}).strict();

export const healthV1SuccessSchema = z.object({
  data: z.object({ status: z.literal('ok') }).strict(),
}).strict();

export const aiReadyV1SuccessSchema = z.object({
  data: z.object({ status: z.enum(['ready', 'not_configured']) }).strict(),
}).strict();

export type AiV1ErrorCode = (typeof aiV1ErrorCodes)[number];
export type AiRecommendV1Request = z.infer<typeof aiRecommendV1RequestSchema>;
export type AiRecommendV1Success = z.infer<typeof aiRecommendV1SuccessSchema>;
export type AiV1Error = z.infer<typeof aiV1ErrorSchema>;
export type AiCandidate = z.infer<typeof aiCandidateSchema>;
export type ClothingRequirement = z.infer<typeof clothingRequirementSchema>;
export type AiOutfit = z.infer<typeof aiOutfitSchema>;
export type AiOutfitGarment = z.infer<typeof aiOutfitGarmentSchema>;
