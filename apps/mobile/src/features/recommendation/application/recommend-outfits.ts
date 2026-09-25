import {
  archetypeDayFromRequirements,
  dayBlindArchetypeDay,
  formalityOrderByDressStyle,
  type ArchetypeDay,
  type DayKind,
  type DressStyle,
  type FormalityLevel,
  type OutfitArchetypeId,
  type StyleAesthetic,
} from '@kuyara/contracts';

import type { ClothingPreference } from '@/domain/preferences';
import { sortByAestheticAffinity } from '@/features/recommendation/domain/aesthetic-affinity';
import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  composeOutfitOptions,
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
  excludedOptionIds?: readonly string[];
  recentWorn?: readonly WornOutfit[];
}>;

export type OutfitRecommendationSuccess = Readonly<{
  status: 'recommended';
  insightSentence?: string;
  insightLocale?: 'tr' | 'en';
  generationMode: RecommendationGenerationMode;
  requirements: ClothingRequirements;
  outfits: readonly RecommendedOutfit[];
}>;

export type RecommendedOutfit = OutfitCandidate & Readonly<{
  optionId: string;
  archetypeId: OutfitArchetypeId;
}>;

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

function assignedGarments(outfit: OutfitCandidate) {
  return [
    ...(outfit.body.kind === 'separates'
      ? [outfit.body.primaryTop, outfit.body.bottom]
      : [outfit.body.onePiece]),
    outfit.midLayer,
    outfit.outerLayer,
    outfit.footwear,
  ].filter((garment) => garment !== null);
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
      return outfit.outerLayer?.garment.properties.thermalLevel === 'high';
    case 'wind_guard':
      return assignedGarments(outfit).some(
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
  return /^[A-Za-z0-9:_-]{1,32}$/.test(candidate)
    ? candidate
    : `outfit:${hashCompositionKey(candidate, 0x811c9dc5)}${hashCompositionKey(candidate, 0x9e3779b9)}`;
}

export function excludeOutfitOptions(
  outfits: readonly OutfitCandidate[],
  excludedOptionIds: readonly string[] = [],
): readonly OutfitCandidate[] {
  if (excludedOptionIds.length === 0) return outfits;
  const excluded = new Set(excludedOptionIds);
  const filtered = outfits.filter((outfit) => !excluded.has(outfitOptionId(outfit)));
  return filtered.length >= 3 ? Object.freeze(filtered) : outfits;
}

export function composeOutfitPool(
  requirements: ClothingRequirements,
  clothingPreference: ClothingPreference,
  dayVariant: number,
  recentWorn: readonly WornOutfit[] = [],
): OutfitCompositionsResult {
  const candidates = listGarmentTypesForPreference(clothingPreference).map((type) =>
    evaluateGarmentEligibility(
      requirements,
      projectCatalogEffectiveGarment(type.typeId, clothingPreference),
    ),
  );
  return composeOutfitOptions(requirements, candidates, dayVariant, recentWorn);
}

/**
 * The day is read once here and handed to every label decision: the order it labels in and
 * the labels themselves both come from the same requirements, so a day can never be snowy
 * for the order and dry for the predicate.
 */
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
    const archetypeId = order.find(
      (candidate) => !used.has(candidate)
        && outfitMatchesArchetype(outfit, candidate, dayKind, day),
    );
    if (!archetypeId) continue;
    used.add(archetypeId);
    selected.push(Object.freeze({
      ...outfit,
      optionId: outfitOptionId(outfit),
      archetypeId,
    }));
    if (selected.length === count) break;
  }
  if (selected.length < count) throw new Error('Distinct fallback archetypes are unavailable.');
  return Object.freeze(selected);
}

export function recommendOutfits(
  input: OutfitRecommendationInput,
): OutfitRecommendationResult {
  const requirements = deriveClothingRequirements(input.snapshot, input.now,
    input.departureAt ?? input.now);
  const composition = composeOutfitPool(requirements, input.clothingPreference, input.dayVariant,
    input.recentWorn);
  const order: readonly FormalityLevel[] =
    formalityOrderByDressStyle[input.dressStyle ?? 'smart'];

  const availableOutfits = composition.status === 'composed'
    ? excludeOutfitOptions(composition.outfits, input.excludedOptionIds)
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
          [...sortByAestheticAffinity(availableOutfits, input.styleAesthetics ?? [],
            (outfit, id) => outfitMatchesArchetype(outfit, id, input.dayKind))].sort(
            (left, right) => order.indexOf(left.formality) - order.indexOf(right.formality),
          ),
          requirements,
          Math.min(3, availableOutfits.length),
          input.dayKind,
        ),
      });
}
