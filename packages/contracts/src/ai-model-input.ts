import {
  accessoryOutfitSlots,
  formalityOrderByDressStyle,
  outfitArchetypeIds,
  type AiOption,
  type AiRecommendV1Request,
  type DayKind,
  type FormalityLevel,
  type OutfitArchetypeId,
} from './ai-v1.ts';

type AiOptionGarment = AiOption['garments'][number];

/**
 * The three facts about the weather an archetype label can contradict: `rain_ready` on a
 * day with nothing falling, `snow_day` on a day with no snow, `light_and_airy` on a day
 * that asks for insulation. Both archetype twins read them, and both read them from the
 * requirements the request already carries, so no request field and no enum member moves.
 */
export type ArchetypeDay = Readonly<{
  frozen: boolean;
  wet: boolean;
  cold: boolean;
}>;

/**
 * What an absent day means: no fact contradicts any label, which is the day-blind behaviour
 * of every caller that passes none, builds 8 and 9 included.
 */
export const dayBlindArchetypeDay: ArchetypeDay = Object.freeze({
  frozen: true,
  wet: true,
  cold: false,
});

const wetReasonCodes = Object.freeze([
  'precipitation_possible',
  'precipitation_likely',
  'condition_drizzle',
  'condition_rain',
  'condition_heavy_rain',
  'condition_thunderstorm',
]);

/**
 * Reads the day out of the derived clothing requirements, the one weather description both
 * the request and the device already hold. Structural on purpose: the Worker passes the
 * parsed request's requirements and the app passes its own domain ones.
 */
export function archetypeDayFromRequirements(
  requirements: readonly Readonly<{
    kind: string;
    minimum?: string;
    priority: string;
    reasonCodes: readonly string[];
  }>[],
): ArchetypeDay {
  const reasonCodes = new Set(requirements.flatMap(({ reasonCodes: codes }) => codes));
  // Sleet and snow are the frozen days. They make a waterproof shell mandatory like rain
  // does, which is why a frozen day is not a wet one: what is falling is not rain.
  const frozen = reasonCodes.has('condition_snow') || reasonCodes.has('condition_sleet');
  return Object.freeze({
    frozen,
    wet: !frozen && wetReasonCodes.some((code) => reasonCodes.has(code)),
    // The thermal rung the day opens at 12 C, where full coverage turns mandatory too. A
    // day whose cold side is demoted by current heat asks for nothing and stays airy.
    cold: requirements.some(({ kind, minimum, priority }) =>
      kind === 'thermal' && priority === 'mandatory'
      && (minimum === 'moderate' || minimum === 'high')),
  });
}

export type AiModelInput = Readonly<{
  clothingPreference: AiRecommendV1Request['clothingPreference'];
  formalityOrder: readonly FormalityLevel[];
  dayKind?: DayKind;
  options: readonly Readonly<{
    optionId: AiOption['optionId'];
    formality: AiOption['formality'];
    garments: readonly Readonly<{
      slot: AiOptionGarment['slot'];
      garmentTypeId: AiOptionGarment['garmentTypeId'];
    }>[];
    eligibleArchetypeIds: readonly OutfitArchetypeId[];
  }>[];
}>;

/**
 * The only structured data a model may see. Cache-key and validation-only fields
 * (requirements, catalogVersion, dayVariant, dressStyle itself, traits, layerRole) are
 * deliberately left out. Traits stay out; the archetype eligibility they decide is
 * projected instead, because the caller rejects any pick whose archetype fails its
 * precondition and a model that cannot see eligibility can only guess. Both the Worker
 * client and the on-device client project through this one function, so the approved
 * field list has one home.
 */
export function aiModelInputFromRequest(request: AiRecommendV1Request): AiModelInput {
  const day = archetypeDayFromRequirements(request.requirements);
  return {
    clothingPreference: request.clothingPreference,
    formalityOrder: formalityOrderByDressStyle[request.dressStyle ?? 'smart'],
    ...(request.dayKind ? { dayKind: request.dayKind } : {}),
    options: request.options.map((option) => ({
      optionId: option.optionId,
      formality: option.formality,
      garments: option.garments.map(({ slot, garmentTypeId }) => ({
        slot,
        garmentTypeId,
      })),
      eligibleArchetypeIds: projectedArchetypeIdsForOption(option, request.dayKind, day),
    })),
  };
}

function garmentType(option: AiOption, slot: AiOptionGarment['slot']) {
  return option.garments.find((garment) => garment.slot === slot)?.garmentTypeId;
}

/**
 * One definition of when an archetype label may be attached to an option. The caller
 * validates every pick against this, and the projection offers the same answer to the
 * model, so the model is asked only for labels it can actually justify.
 */
export function meetsArchetypePrecondition(
  archetypeId: OutfitArchetypeId,
  option: AiOption,
  dayKind?: DayKind,
  day: ArchetypeDay = dayBlindArchetypeDay,
): boolean {
  switch (archetypeId) {
    case 'everyday_easy':
      return true;
    case 'smart_casual':
      return option.formality === 'smart' || option.formality === 'formal';
    case 'office_ready':
      // Builds 8 and 9 accept this label only for formal outfits and send no dayKind.
      // Its presence identifies a newer caller whose matching gate also accepts smart.
      return option.formality === 'formal'
        || (option.formality === 'smart' && dayKind !== undefined);
    case 'weekend_relaxed':
      // A weekday is never relaxed in the weekend sense. An absent dayKind leaves the
      // archetype eligible, so a caller that sends none keeps the day-blind behaviour.
      return option.formality === 'casual' && dayKind !== 'weekday';
    case 'layered_warmth':
      return option.traits.hasMidLayer && option.traits.hasOuterLayer;
    case 'cold_shield':
      return option.traits.outerThermalHigh;
    case 'rain_ready':
      // A waterproof shell is a rain answer only where rain is what falls. On a dry day it
      // is the day's only high-thermal outer layer, and on a frozen one it is the snow
      // shell; neither is a rain label.
      return option.traits.outerWaterProtective && day.wet;
    case 'snow_day':
      // Enhanced traction answers snow and sleet. Rain boots on a rainy day carry it too,
      // which is how every wet day used to read as a frozen one.
      return option.traits.tractionEnhanced && day.frozen;
    case 'wind_guard':
      return option.traits.windResistant;
    case 'light_and_airy':
      // Breathable and shell-free is airy only where the day is not asking for insulation.
      return !option.traits.hasOuterLayer && option.traits.breathabilityHigh && !day.cold;
    case 'on_the_move':
      // Builds 8 and 9 accept this label only for sneakers and send no dayKind. Its
      // presence identifies a newer caller whose matching gate also accepts any casual
      // outfit, which a hot dry day needs: its pool is casual in sandals throughout.
      return garmentType(option, 'footwear') === 'sneakers'
        || (option.formality === 'casual' && dayKind !== undefined);
    case 'in_between':
      return option.traits.hasMidLayer && !option.traits.hasOuterLayer;
  }
}

/**
 * The conditional archetypes an option qualifies for. `everyday_easy` has no
 * precondition, so repeating it under all 24 options would spend the on-device session
 * window on a constant; both prompts state instead that it is always allowed. The gate
 * still accepts it, because its precondition holds for every option on every day.
 */
function projectedArchetypeIdsForOption(
  option: AiOption,
  dayKind: DayKind | undefined,
  day: ArchetypeDay,
): readonly OutfitArchetypeId[] {
  return outfitArchetypeIds.filter((archetypeId) =>
    archetypeId !== 'everyday_easy'
    && meetsArchetypePrecondition(archetypeId, option, dayKind, day));
}

function hasDifferentBodyCore(left: AiOption, right: AiOption): boolean {
  const leftOnePiece = garmentType(left, 'one_piece');
  const rightOnePiece = garmentType(right, 'one_piece');
  if (Boolean(leftOnePiece) !== Boolean(rightOnePiece)) return true;
  if (leftOnePiece || rightOnePiece) return leftOnePiece !== rightOnePiece;
  return garmentType(left, 'primary_top') !== garmentType(right, 'primary_top')
    || garmentType(left, 'bottom') !== garmentType(right, 'bottom');
}

const accessorySlots = new Set<string>(accessoryOutfitSlots);

/**
 * The slot/garment pairs distinctness counts. Accessories are left out: they follow from the
 * weather and the outfit's formality alone, so two options that differ only in a shoe would
 * otherwise look three pairs apart the moment that shoe moved them to another formality.
 */
function countedPairs(option: AiOption): Set<string> {
  return new Set(
    option.garments
      .filter(({ slot }) => !accessorySlots.has(slot))
      .map(({ slot, garmentTypeId }) => `${slot}|${garmentTypeId}`),
  );
}

function isMeaningfullyDifferent(left: AiOption, right: AiOption): boolean {
  if (hasDifferentBodyCore(left, right)) return true;
  const leftPairs = countedPairs(left);
  const rightPairs = countedPairs(right);
  const leftOnly = [...leftPairs].filter((pair) => !rightPairs.has(pair)).length;
  const rightOnly = [...rightPairs].filter((pair) => !leftPairs.has(pair)).length;
  return leftOnly >= 2 || rightOnly >= 2;
}

/**
 * One definition of "meaningfully different": every pair of picks differs in the body
 * core, or in at least two slot/garment pairs, accessory slots excluded.
 */
export function picksAreMeaningfullyDifferent(options: readonly AiOption[]): boolean {
  for (let left = 0; left < options.length; left += 1) {
    for (let right = left + 1; right < options.length; right += 1) {
      if (!isMeaningfullyDifferent(options[left]!, options[right]!)) return false;
    }
  }
  return true;
}
