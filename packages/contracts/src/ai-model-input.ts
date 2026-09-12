import {
  formalityOrderByDressStyle,
  type AiOption,
  type AiRecommendV1Request,
  type FormalityLevel,
} from './ai-v1.ts';

type AiOptionGarment = AiOption['garments'][number];

export type AiModelInput = Readonly<{
  clothingPreference: AiRecommendV1Request['clothingPreference'];
  formalityOrder: readonly FormalityLevel[];
  options: readonly Readonly<{
    optionId: AiOption['optionId'];
    formality: AiOption['formality'];
    garments: readonly Readonly<{
      slot: AiOptionGarment['slot'];
      garmentTypeId: AiOptionGarment['garmentTypeId'];
    }>[];
  }>[];
}>;

/**
 * The only structured data a model may see. Cache-key and validation-only fields
 * (requirements, catalogVersion, dayVariant, dressStyle itself, traits, layerRole) are
 * deliberately left out. Both the Worker client and the on-device client project through
 * this one function, so the approved field list has one home.
 */
export function aiModelInputFromRequest(request: AiRecommendV1Request): AiModelInput {
  return {
    clothingPreference: request.clothingPreference,
    formalityOrder: formalityOrderByDressStyle[request.dressStyle ?? 'smart'],
    options: request.options.map(({ optionId, formality, garments }) => ({
      optionId,
      formality,
      garments: garments.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })),
    })),
  };
}

function garmentType(option: AiOption, slot: AiOptionGarment['slot']) {
  return option.garments.find((garment) => garment.slot === slot)?.garmentTypeId;
}

function hasDifferentBodyCore(left: AiOption, right: AiOption): boolean {
  const leftOnePiece = garmentType(left, 'one_piece');
  const rightOnePiece = garmentType(right, 'one_piece');
  if (Boolean(leftOnePiece) !== Boolean(rightOnePiece)) return true;
  if (leftOnePiece || rightOnePiece) return leftOnePiece !== rightOnePiece;
  return garmentType(left, 'primary_top') !== garmentType(right, 'primary_top')
    || garmentType(left, 'bottom') !== garmentType(right, 'bottom');
}

function isMeaningfullyDifferent(left: AiOption, right: AiOption): boolean {
  if (hasDifferentBodyCore(left, right)) return true;
  const leftPairs = new Set(
    left.garments.map(({ slot, garmentTypeId }) => `${slot}|${garmentTypeId}`),
  );
  const rightPairs = new Set(
    right.garments.map(({ slot, garmentTypeId }) => `${slot}|${garmentTypeId}`),
  );
  const leftOnly = [...leftPairs].filter((pair) => !rightPairs.has(pair)).length;
  const rightOnly = [...rightPairs].filter((pair) => !leftPairs.has(pair)).length;
  return leftOnly >= 2 || rightOnly >= 2;
}

/**
 * One definition of "meaningfully different": every pair of picks differs in the body
 * core, or in at least two slot/garment pairs.
 */
export function picksAreMeaningfullyDifferent(options: readonly AiOption[]): boolean {
  for (let left = 0; left < options.length; left += 1) {
    for (let right = left + 1; right < options.length; right += 1) {
      if (!isMeaningfullyDifferent(options[left]!, options[right]!)) return false;
    }
  }
  return true;
}
