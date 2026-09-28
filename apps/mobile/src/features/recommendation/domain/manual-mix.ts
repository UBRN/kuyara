import type { ClothingPreference } from '@/domain/preferences';
import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
  type GarmentEligibilityResult,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  evaluateArrangement,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import { garmentFitsSlot } from '@/features/recommendation/domain/outfit-history';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';

/**
 * Phase 7, manual mix (ADR 0026 section 6): on detail a person may change any drawn piece of
 * kuyara's pick for another catalog piece of the same slot. The recommendation engine never
 * sees it, the Closet never supplies a candidate, and nothing here is stored: only "Wore
 * this today" records the result, as a `manual` worn outfit.
 */
export const swappableSlots = Object.freeze([
  'primary_top',
  'bottom',
  'one_piece',
  'mid_layer',
  'outer_layer',
  'footwear',
] as const);

export type SwappableSlot = (typeof swappableSlots)[number];
export type OutfitSwaps = Readonly<Partial<Record<SwappableSlot, GarmentTypeId>>>;

/** One catalog piece a slot may take, and whether it fits today's weather in kuyara's pick. */
export type SlotCandidate = Readonly<{ garmentTypeId: GarmentTypeId; suitable: boolean }>;

type Garments = Partial<Record<SwappableSlot, GarmentTypeId>>;

/** The drawn pieces of an outfit by slot: the slots a person can change. */
export function outfitGarments(outfit: OutfitCandidate): Readonly<Garments> {
  const garments: Garments = outfit.body.kind === 'separates'
    ? {
        primary_top: outfit.body.primaryTop.garment.garmentTypeId,
        bottom: outfit.body.bottom.garment.garmentTypeId,
      }
    : { one_piece: outfit.body.onePiece.garment.garmentTypeId };
  if (outfit.midLayer) garments.mid_layer = outfit.midLayer.garment.garmentTypeId;
  if (outfit.outerLayer) garments.outer_layer = outfit.outerLayer.garment.garmentTypeId;
  garments.footwear = outfit.footwear.garment.garmentTypeId;
  return Object.freeze(garments);
}

/** The outfit's changeable slots in the stable slot order. */
export function outfitSwappableSlots(outfit: OutfitCandidate): readonly SwappableSlot[] {
  const garments = outfitGarments(outfit);
  return swappableSlots.filter((slot) => garments[slot] !== undefined);
}

function evaluate(
  garments: Readonly<Garments>,
  requirements: ClothingRequirements,
  preference: ClothingPreference,
) {
  const result = (slot: SwappableSlot): GarmentEligibilityResult | null => {
    const id = garments[slot];
    return id === undefined
      ? null
      : evaluateGarmentEligibility(requirements, projectCatalogEffectiveGarment(id, preference));
  };
  const onePiece = result('one_piece');
  const footwear = result('footwear');
  if (!footwear) throw new Error('An outfit always has footwear.');
  return evaluateArrangement(requirements, {
    body: onePiece
      ? { kind: 'one_piece', onePiece }
      : { kind: 'separates', primaryTop: result('primary_top')!, bottom: result('bottom')! },
    midLayer: result('mid_layer'),
    outerLayer: result('outer_layer'),
    footwear,
  });
}

/**
 * Every catalog piece one slot can take, in the order the picker and the board step through:
 * pieces that keep kuyara's pick weather-suitable first, then the rest. The profile's
 * gender applicability is the catalog filter the recommendation used, so a piece outside it
 * never appears; the Closet is never read. Within each group the domain's own score for the
 * resulting outfit decides, then the catalog order, so the order is stable. Computed once
 * per slot against kuyara's pick, so it never reshuffles while the person steps through it.
 */
export function slotCandidates(
  outfit: OutfitCandidate,
  slot: SwappableSlot,
  requirements: ClothingRequirements,
  preference: ClothingPreference,
): readonly SlotCandidate[] {
  const base = outfitGarments(outfit);
  const current = base[slot];
  if (current === undefined) return Object.freeze([]);
  const types = listGarmentTypesForPreference(preference)
    .map(({ typeId }) => typeId)
    .filter((typeId) => garmentFitsSlot(slot, typeId));
  const ids = types.includes(current) ? types : [current, ...types];
  const rated = ids.map((garmentTypeId, order) => {
    const { outfit: arranged, suitable } = evaluate({ ...base, [slot]: garmentTypeId }, requirements, preference);
    return { garmentTypeId, suitable, score: arranged.score, order };
  });
  rated.sort((left, right) => Number(right.suitable) - Number(left.suitable)
    || right.score - left.score || left.order - right.order);
  return Object.freeze(rated.map(({ garmentTypeId, suitable }) => Object.freeze({ garmentTypeId, suitable })));
}

/**
 * A slot's candidates without the pieces another slot is wearing right now: one garment is
 * never worn twice (the worn record refuses it), so a piece taken elsewhere is skipped.
 */
export function availableCandidates(
  candidates: readonly SlotCandidate[],
  slot: SwappableSlot,
  garments: Readonly<Garments>,
): readonly SlotCandidate[] {
  const taken = new Set(swappableSlots.filter((other) => other !== slot).map((other) => garments[other]));
  return Object.freeze(candidates.filter(({ garmentTypeId }) => !taken.has(garmentTypeId)));
}

/** The next piece in one direction of the order, or null at an end: the order never wraps. */
export function neighbourCandidate(
  candidates: readonly SlotCandidate[],
  current: GarmentTypeId,
  direction: 1 | -1,
): GarmentTypeId | null {
  const index = candidates.findIndex(({ garmentTypeId }) => garmentTypeId === current);
  if (index < 0) return null;
  return candidates[index + direction]?.garmentTypeId ?? null;
}

/** Drops every swap that puts kuyara's own piece back, so "changed" always means changed. */
export function normalizeSwaps(outfit: OutfitCandidate, swaps: OutfitSwaps): OutfitSwaps {
  const base = outfitGarments(outfit);
  return Object.freeze(Object.fromEntries(Object.entries(swaps).filter(([slot, id]) =>
    base[slot as SwappableSlot] !== undefined && base[slot as SwappableSlot] !== id)));
}

export type ManualOutfit<Outfit extends OutfitCandidate> = Readonly<{
  /** The outfit on screen: kuyara's pick, or the changed arrangement with the pick's identity. */
  outfit: Outfit;
  changedSlots: readonly SwappableSlot[];
  /** The domain rejects the changed set for today's weather: detail says so, and still allows it. */
  unusual: boolean;
}>;

/**
 * The outfit a set of swaps produces, evaluated by the domain. It keeps the pick's option id,
 * archetype and finishing touches, so the screen, the palette and the worn record still
 * know which recommendation it came from; everything the composition decides (reasoning,
 * trade-offs, formality) is recomputed for the pieces now worn.
 */
export function applySwaps<Outfit extends OutfitCandidate>(
  outfit: Outfit,
  swaps: OutfitSwaps,
  requirements: ClothingRequirements,
  preference: ClothingPreference,
): ManualOutfit<Outfit> {
  const effective = normalizeSwaps(outfit, swaps);
  const changedSlots = swappableSlots.filter((slot) => effective[slot] !== undefined);
  if (changedSlots.length === 0) return Object.freeze({ outfit, changedSlots, unusual: false });
  const { outfit: arranged, suitable } = evaluate(
    { ...outfitGarments(outfit), ...effective },
    requirements,
    preference,
  );
  return Object.freeze({
    outfit: Object.freeze({ ...outfit, ...arranged, accessories: outfit.accessories }),
    changedSlots: Object.freeze(changedSlots),
    unusual: !suitable,
  });
}
