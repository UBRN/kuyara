import { z } from 'zod';

export const aiRecommendV1Path = '/v1/ai/recommend' as const;
export const aiProbeV1Path = '/v1/ai/probe' as const;
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

export const formalityLevels = ['casual', 'smart', 'formal'] as const;

export const outfitArchetypeIds = [
  'everyday_easy',
  'smart_casual',
  'office_ready',
  'weekend_relaxed',
  'layered_warmth',
  'cold_shield',
  'rain_ready',
  'snow_day',
  'wind_guard',
  'light_and_airy',
  'on_the_move',
  'in_between',
] as const;

export const aiV1ErrorCodes = [
  'invalid_request',
  'not_found',
  'method_not_allowed',
  'ai_unavailable',
  'internal_error',
  'rate_limited',
] as const;

// Transport budget, not a model limit: 24 options keep the prompt near 2 KB.
export const aiV1OptionLimit = 24;

const optionIdSchema = z.string().regex(/^[A-Za-z0-9:_-]{1,32}$/);
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

const aiOptionGarmentSchema = z.object({
  slot: z.enum(outfitSlots),
  layerRole: z.enum(layerRoles).nullable(),
  garmentTypeId: z.enum(garmentTypeIds),
}).strict();

export const aiOptionSchema = z.object({
  optionId: optionIdSchema,
  formality: z.enum(formalityLevels),
  garments: z.array(aiOptionGarmentSchema).min(2).max(5),
  traits: z.object({
    hasMidLayer: z.boolean(),
    hasOuterLayer: z.boolean(),
    outerThermalHigh: z.boolean(),
    outerWaterProtective: z.boolean(),
    windResistant: z.boolean(),
    tractionEnhanced: z.boolean(),
    breathabilityHigh: z.boolean(),
  }).strict(),
}).strict().superRefine(({ garments }, context) => {
  const slots = new Set<(typeof outfitSlots)[number]>();
  garments.forEach(({ slot }, index) => {
    if (slots.has(slot)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Slots must be unique within an option.',
        path: ['garments', index, 'slot'],
      });
    }
    slots.add(slot);
  });

  const slotCount = (slot: (typeof outfitSlots)[number]): number =>
    garments.filter((garment) => garment.slot === slot).length;
  if (slotCount('footwear') !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'An option must contain exactly one footwear slot.',
      path: ['garments'],
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
      message: 'An option must contain exactly one complete body core.',
      path: ['garments'],
    });
  }

  for (const slot of ['mid_layer', 'outer_layer'] as const) {
    if (slotCount(slot) > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `An option may contain at most one ${slot}.`,
        path: ['garments'],
      });
    }
  }
});

export const aiRecommendV1RequestSchema = z.object({
  clothingPreference: z.enum(clothingPreferences),
  catalogVersion: z.number().int().min(1),
  dayVariant: z.number().int().min(0).max(6),
  // Requirements are cache-key inputs and never reach the model.
  requirements: z.array(clothingRequirementSchema).min(1).max(8),
  options: z.array(aiOptionSchema).min(1).max(aiV1OptionLimit),
}).strict().superRefine(({ options }, context) => {
  const seen = new Set<string>();
  options.forEach(({ optionId }, index) => {
    if (seen.has(optionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Option ids must be unique.',
        path: ['options', index, 'optionId'],
      });
    }
    seen.add(optionId);
  });
});

export const aiRecommendV1SuccessSchema = z.object({
  data: z.object({
    picks: z.array(z.object({
      optionId: optionIdSchema,
      archetypeId: z.enum(outfitArchetypeIds),
    }).strict()).length(3),
  }).strict(),
}).strict().superRefine(({ data }, context) => {
  const optionIds = new Set<string>();
  const archetypeIds = new Set<(typeof outfitArchetypeIds)[number]>();
  data.picks.forEach(({ optionId, archetypeId }, index) => {
    if (optionIds.has(optionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Picked option ids must be unique.',
        path: ['data', 'picks', index, 'optionId'],
      });
    }
    if (archetypeIds.has(archetypeId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Picked archetype ids must be unique.',
        path: ['data', 'picks', index, 'archetypeId'],
      });
    }
    optionIds.add(optionId);
    archetypeIds.add(archetypeId);
  });
});

export const aiProbeV1SuccessSchema = z.object({
  data: z.object({
    status: z.enum(['ok', 'unavailable']),
    checkedAt: z.string().datetime(),
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
export type AiProbeV1Success = z.infer<typeof aiProbeV1SuccessSchema>;
export type AiV1Error = z.infer<typeof aiV1ErrorSchema>;
export type ClothingRequirement = z.infer<typeof clothingRequirementSchema>;
export type AiOption = z.infer<typeof aiOptionSchema>;
export type OutfitArchetypeId = (typeof outfitArchetypeIds)[number];
export type FormalityLevel = (typeof formalityLevels)[number];
