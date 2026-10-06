import {
  archetypeDayFromRequirements,
  dayBlindArchetypeDay,
  formalityOrderByDressStyle,
  optionIdSchema,
  type ArchetypeDay,
  type DayKind,
  type DressStyle,
  type FormalityLevel,
  type OutfitArchetypeId,
  type StyleAesthetic,
} from '@kuyara/contracts';

import type { ClothingPreference, SupportedLanguage } from '@/domain/preferences';
import { sortByAestheticAffinity } from '@/features/recommendation/domain/aesthetic-affinity';
import { listSelectableGarmentTypes } from '@/features/catalog/domain/garment-catalog';
import { poolCompositionKey } from '@/features/recommendation/application/pool-composition-key';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
  type GarmentEligibilityResult,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  assignedOutfitGarments,
  composeOutfitOptions,
  garmentIdSet,
  type OutfitCandidate,
  type OutfitCompositionFailure,
  type OutfitCompositionsResult,
} from '@/features/recommendation/domain/outfit-composition';
import {
  deriveClothingRequirements,
  type ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import type { WeatherSnapshot } from '@/features/weather/domain/weather';
import { defaultDressStyle } from '@/features/profile/domain/profile';

export type OutfitRecommendationInput = Readonly<{
  snapshot: WeatherSnapshot;
  /** The moment the recommendation is for; decides the local day and the hours left in it. */
  now: string;
  /** A persisted Later choice. Absent means the current instant. */
  departureAt?: string;
  clothingPreference: ClothingPreference;
  dressStyle?: DressStyle;
  styleAesthetics?: readonly StyleAesthetic[];
  dayVariant: number;
  /** Absent keeps the day-blind behaviour, where `weekend_relaxed` fits any casual outfit. */
  dayKind?: DayKind;
  /** Outfits already shown; any outfit wearing the same body garments is left out. */
  excludedOutfits?: readonly OutfitCandidate[];
  recentWorn?: readonly WornOutfit[];
}>;

export type OutfitRecommendationSuccess = Readonly<{
  status: 'recommended';
  insightSentence?: string;
  insightLocale?: SupportedLanguage;
  generationMode: RecommendationGenerationMode;
  requirements: ClothingRequirements;
  outfits: readonly RecommendedOutfit[];
}>;

export type RecommendedOutfit = OutfitCandidate & Readonly<{
  optionId: string;
  archetypeId: OutfitArchetypeId;
}>;

/** An outfit given the label it is offered under. */
export function recommendedOutfit(
  outfit: OutfitCandidate,
  archetypeId: OutfitArchetypeId,
): RecommendedOutfit {
  return Object.freeze({ ...outfit, optionId: outfitOptionId(outfit), archetypeId });
}

export type OutfitRecommendationUnavailable = Readonly<{
  status: 'unavailable';
  requirements: ClothingRequirements;
  failure: OutfitCompositionFailure;
}>;

export type OutfitRecommendationResult =
  | OutfitRecommendationSuccess
  | OutfitRecommendationUnavailable;

const fallbackArchetypeOrder = Object.freeze([
  'rain_ready',
  'snow_day',
  'cold_shield',
  'wind_guard',
  'layered_warmth',
  'in_between',
  'light_and_airy',
  'office_ready',
  'smart_casual',
  'weekend_relaxed',
  'on_the_move',
  'everyday_easy',
] as const satisfies readonly OutfitArchetypeId[]);

/**
 * The order a snow or sleet day labels in. Snow makes a waterproof outer layer mandatory, so
 * every outfit it composes matched `rain_ready` first and a frozen day read as rain; the
 * snow label leads instead and the rain label leaves the day's order, since the precipitation
 * it names is not what is falling.
 */
const frozenFallbackArchetypeOrder = Object.freeze([
  'snow_day',
  ...fallbackArchetypeOrder.filter(
    (archetypeId) => archetypeId !== 'snow_day' && archetypeId !== 'rain_ready',
  ),
] as const satisfies readonly OutfitArchetypeId[]);

function fallbackArchetypeOrderFor(
  requirements: ClothingRequirements,
): readonly OutfitArchetypeId[] {
  return requirements.reasonCodes.some(
    (code) => code === 'condition_snow' || code === 'condition_sleet',
  )
    ? frozenFallbackArchetypeOrder
    : fallbackArchetypeOrder;
}

export function outfitMatchesArchetype(
  outfit: OutfitCandidate,
  archetypeId: OutfitArchetypeId,
  dayKind?: DayKind,
  day: ArchetypeDay = dayBlindArchetypeDay,
): boolean {
  const primary = outfit.body.kind === 'separates'
    ? outfit.body.primaryTop
    : outfit.body.onePiece;
  switch (archetypeId) {
    case 'rain_ready':
      // A waterproof shell is a rain answer only where rain is what falls. On a dry day it
      // is the day's only high-thermal outer layer, and on a frozen one it is the snow
      // shell; neither is a rain label.
      return day.wet && (
        outfit.outerLayer?.garment.properties.waterProtection === 'water_resistant' ||
        outfit.outerLayer?.garment.properties.waterProtection === 'waterproof');
    case 'snow_day':
      // Enhanced traction answers snow and sleet. Rain boots on a rainy day carry it too,
      // which is how every wet day used to read as a frozen one.
      return day.frozen &&
        outfit.footwear.garment.properties.tractionSuitability === 'enhanced';
    case 'cold_shield':
      return (day === dayBlindArchetypeDay || day.cold) &&
        outfit.outerLayer?.garment.properties.thermalLevel === 'high';
    case 'wind_guard':
      return day.windy && assignedOutfitGarments(outfit).some(
        ({ garment }) => garment.properties.windProtection === 'wind_resistant',
      );
    case 'layered_warmth':
      return outfit.midLayer !== null && outfit.outerLayer !== null;
    case 'in_between':
      return outfit.midLayer !== null && outfit.outerLayer === null;
    case 'light_and_airy':
      // Breathable and shell-free is airy only where the day is not asking for insulation.
      return !day.cold && outfit.outerLayer === null &&
        primary.garment.properties.breathability === 'high';
    case 'office_ready':
      // Builds 8 and 9 accept this label only for formal outfits and send no dayKind.
      // Its presence identifies a newer caller whose matching gate also accepts smart.
      return outfit.formality === 'formal'
        || (outfit.formality === 'smart' && dayKind !== undefined);
    case 'smart_casual':
      return outfit.formality === 'smart' || outfit.formality === 'formal';
    case 'on_the_move':
      // Builds 8 and 9 accept this label only for sneakers and send no dayKind. Its
      // presence identifies a newer caller whose matching gate also accepts any casual
      // outfit, which a hot dry day needs: its pool is casual in sandals throughout.
      return outfit.footwear.garment.garmentTypeId === 'sneakers'
        || (outfit.formality === 'casual' && dayKind !== undefined);
    case 'weekend_relaxed':
      // Mirrors `meetsArchetypePrecondition` in packages/contracts: on a weekday a casual
      // outfit falls through the order to `on_the_move`, the rung below it, instead.
      return outfit.formality === 'casual' && dayKind !== 'weekday';
    case 'everyday_easy':
      return true;
  }
}

function hashCompositionKey(value: string, seed: number): string {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function outfitOptionId(outfit: OutfitCandidate): string {
  const candidate = outfit.compositionKey.replaceAll('|', ':');
  return optionIdSchema.safeParse(candidate).success
    ? candidate
    : `outfit:${hashCompositionKey(candidate, 0x811c9dc5)}${hashCompositionKey(candidate, 0x9e3779b9)}`;
}

/**
 * Leaves out every outfit that wears the body garments of one already shown. The comparison
 * reads the garments rather than the option id, because the id carries the day's accessories:
 * yesterday's outfit under today's accessories is still yesterday's outfit.
 */
export function excludeOutfitOptions(
  outfits: readonly OutfitCandidate[],
  excludedOutfits: readonly OutfitCandidate[] = [],
): readonly OutfitCandidate[] {
  if (excludedOutfits.length === 0) return outfits;
  const excluded = new Set(excludedOutfits.map(garmentIdSet));
  const filtered = outfits.filter((outfit) => !excluded.has(garmentIdSet(outfit)));
  return filtered.length >= 3 ? Object.freeze(filtered) : outfits;
}

/** Every selectable catalog garment of the profile's applicability, evaluated against the day: what the composer reads. */
export function eligibilityCandidates(
  requirements: ClothingRequirements,
  clothingPreference: ClothingPreference,
): readonly GarmentEligibilityResult[] {
  return listSelectableGarmentTypes(clothingPreference).map((type) =>
    evaluateGarmentEligibility(
      requirements,
      projectCatalogEffectiveGarment(type.typeId, clothingPreference),
    ),
  );
}

let lastComposedPool: Readonly<{ key: string; result: OutfitCompositionsResult }> | null = null;

export function composeOutfitPool(
  requirements: ClothingRequirements,
  clothingPreference: ClothingPreference,
  dayVariant: number,
  recentWorn: readonly WornOutfit[] = [],
): OutfitCompositionsResult {
  const key = poolCompositionKey(requirements, clothingPreference, dayVariant, recentWorn);
  if (lastComposedPool?.key === key) return lastComposedPool.result;
  const result = composeOutfitOptions(
    requirements,
    eligibilityCandidates(requirements, clothingPreference),
    dayVariant,
    recentWorn,
  );
  lastComposedPool = { key, result };
  return result;
}

/**
 * The day is read once here and handed to every label decision: the order it labels in and
 * the labels themselves both come from the same requirements, so a day can never be snowy
 * for the order and dry for the predicate.
 */
function firstUnusedArchetype(
  outfit: OutfitCandidate,
  order: readonly OutfitArchetypeId[],
  used: ReadonlySet<OutfitArchetypeId>,
  dayKind: DayKind | undefined,
  day: ArchetypeDay,
): OutfitArchetypeId | undefined {
  return order.find(
    (candidate) => !used.has(candidate) && outfitMatchesArchetype(outfit, candidate, dayKind, day),
  );
}

export function assignFallbackArchetypes(
  outfits: readonly OutfitCandidate[],
  requirements: ClothingRequirements,
  count: number = outfits.length,
  dayKind?: DayKind,
): readonly RecommendedOutfit[] {
  const order = fallbackArchetypeOrderFor(requirements);
  const day = archetypeDayFromRequirements(requirements.requirements);
  const used = new Set<OutfitArchetypeId>();
  const selected: RecommendedOutfit[] = [];
  for (const outfit of outfits) {
    const archetypeId = firstUnusedArchetype(outfit, order, used, dayKind, day);
    if (!archetypeId) continue;
    used.add(archetypeId);
    selected.push(recommendedOutfit(outfit, archetypeId));
    if (selected.length === count) break;
  }
  if (selected.length < count) throw new Error('Distinct fallback archetypes are unavailable.');
  return Object.freeze(selected);
}

/**
 * The labels for the one, two or three outfits compose around chosen pieces offers: the same
 * order and predicates as Today's, each label used once while one fits, and the catch-all
 * label for an outfit nothing else fits. Compose never throws for want of a distinct label;
 * Today's three-pick path above still does.
 */
export function assignComposedArchetypes(
  outfits: readonly OutfitCandidate[],
  requirements: ClothingRequirements,
  dayKind?: DayKind,
): readonly RecommendedOutfit[] {
  const order = fallbackArchetypeOrderFor(requirements);
  const day = archetypeDayFromRequirements(requirements.requirements);
  const used = new Set<OutfitArchetypeId>();
  return Object.freeze(outfits.map((outfit) => {
    const archetypeId = firstUnusedArchetype(outfit, order, used, dayKind, day) ?? 'everyday_easy';
    used.add(archetypeId);
    return recommendedOutfit(outfit, archetypeId);
  }));
}

/**
 * Dress style reorders what is offered and excludes nothing (ADR 0031): aesthetic affinity
 * first, then the style's formality ladder. Today's three and the compose picks share it.
 */
export function orderByDressStyle(
  outfits: readonly OutfitCandidate[],
  { dressStyle, styleAesthetics, dayKind }: Readonly<{
    dressStyle?: DressStyle;
    styleAesthetics?: readonly StyleAesthetic[];
    dayKind?: DayKind;
  }>,
  requirements: ClothingRequirements,
): readonly OutfitCandidate[] {
  const day = archetypeDayFromRequirements(requirements.requirements);
  const order: readonly FormalityLevel[] = formalityOrderByDressStyle[dressStyle ?? defaultDressStyle];
  return [...sortByAestheticAffinity(outfits, styleAesthetics ?? [],
    (outfit, id) => outfitMatchesArchetype(outfit, id, dayKind, day))].sort(
    (left, right) => order.indexOf(left.formality) - order.indexOf(right.formality),
  );
}

export function recommendOutfits(
  input: OutfitRecommendationInput,
): OutfitRecommendationResult {
  const requirements = deriveClothingRequirements(input.snapshot, input.now,
    input.departureAt ?? input.now);
  const composition = composeOutfitPool(requirements, input.clothingPreference, input.dayVariant,
    input.recentWorn);

  const availableOutfits = composition.status === 'composed'
    ? excludeOutfitOptions(composition.outfits, input.excludedOutfits)
    : [];

  return composition.status === 'failure'
    ? Object.freeze({
        status: 'unavailable',
        requirements,
        failure: composition,
      })
    : Object.freeze({
        status: 'recommended',
        generationMode: 'deterministic-fallback',
        requirements,
        outfits: assignFallbackArchetypes(
          orderByDressStyle(availableOutfits, input, requirements),
          requirements,
          Math.min(3, availableOutfits.length),
          input.dayKind,
        ),
      });
}
