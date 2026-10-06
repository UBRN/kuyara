import type { GarmentEligibilityResult } from '@/features/recommendation/domain/garment-eligibility';
import { accessorySetsByFormality, withAccessories } from '@/features/recommendation/domain/outfit-accessories';
import {
  noValidCompositionFailure,
  readComposerDay,
  validDrafts,
  type ComposerDay,
} from '@/features/recommendation/domain/outfit-enumeration';
import {
  draftArrangement,
  outfitOf,
  type JudgedDraft,
} from '@/features/recommendation/domain/outfit-evaluation';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import {
  outfitWearsPins,
  type OutfitCandidate,
  type OutfitCompositionFailure,
  type OutfitCompositionsResult,
  type OutfitPin,
} from '@/features/recommendation/domain/outfit-model';
import {
  composedOutfitLimit,
  excludeRecentlyWornOutfits,
  offeredOutfitLimit,
  orderForOffer,
  pinSubsets,
  selectDiverseOutfits,
  selectOfferedOutfits,
} from '@/features/recommendation/domain/outfit-offer';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';

// The composer's public entry. The day's eligible candidates are arranged into the six body
// slots in `outfit-enumeration.ts`, judged by `outfit-evaluation.ts`, offered by
// `outfit-offer.ts` and finished by `outfit-accessories.ts`; the outfit itself is
// `outfit-model.ts` and its slots `outfit-slots.ts`. Callers import from here.

export {
  accessoryOutfitSlots,
  garmentFitsSlot,
  onePieceExcludes,
  outfitSlots,
  type AccessoryOutfitSlot,
  type OutfitSlot,
} from '@/features/recommendation/domain/outfit-slots';
export {
  assignedOutfitGarments,
  garmentIdSet,
  outfitCompositionFailureCodes,
  outfitCompositionReasonCodes,
  outfitGarments,
  outfitWearsPins,
  type AssignedOutfitGarment,
  type OutfitAccessories,
  type OutfitCandidate,
  type OutfitCompositionFailure,
  type OutfitCompositionReasonCode,
  type OutfitCompositionsResult,
  type OutfitPin,
  type OutfitRequirementEvaluation,
} from '@/features/recommendation/domain/outfit-model';
export { evaluateArrangement, isFormalSuit } from '@/features/recommendation/domain/outfit-evaluation';
export { assignAccessory, offeredAccessoriesBySlot } from '@/features/recommendation/domain/outfit-accessories';
export {
  composedOutfitLimit,
  excludeRecentlyWornOutfits,
  offeredOutfitLimit,
} from '@/features/recommendation/domain/outfit-offer';

/** The day's valid drafts, best first, or the failure of a day that composes none. */
function composeDay(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
  ordersLayers = true,
): Readonly<{ status: 'composed'; day: ComposerDay; valid: readonly JudgedDraft[] }> | OutfitCompositionFailure {
  const day = readComposerDay(requirements, candidates, ordersLayers);
  if (day.status === 'failure') return day;
  const valid = validDrafts(day);
  return valid.length === 0
    ? noValidCompositionFailure(day)
    : Object.freeze({ status: 'composed', day, valid });
}

/**
 * Every valid composition, sorted best first, each finished with the day's accessories.
 * The mapper rebuilds one stored or AI-chosen option through here, so what it hands back
 * has to carry the accessories that option was written with. A saved outfit is rebuilt with
 * `ordersLayers: false`: one composed before the layer order rule stays readable.
 */
export function collectValidOutfits(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
  { ordersLayers = true }: Readonly<{ ordersLayers?: boolean }> = {},
): OutfitCompositionsResult {
  const composed = composeDay(requirements, candidates, ordersLayers);
  if (composed.status === 'failure') return composed;
  return Object.freeze({
    status: 'composed',
    outfits: Object.freeze(
      withAccessories(composed.valid.map(outfitOf), accessorySetsByFormality(composed.day.eligible)),
    ),
  });
}

export function composeOutfitOptions(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
  startOffset: number,
  recentWorn: readonly WornOutfit[] = [],
): OutfitCompositionsResult {
  const composed = composeDay(requirements, candidates);
  if (composed.status === 'failure') return composed;
  // Only the offered drafts become outfits, and only they take accessories. The order and the
  // diversity rule read score, formality, body core and candidate keys, none of which an
  // accessory touches, so a mild day builds 24 outfits rather than its tens of thousands of
  // valid arrangements.
  return Object.freeze({
    status: 'composed',
    outfits: excludeRecentlyWornOutfits(withAccessories(
      selectOfferedOutfits(orderForOffer(composed.valid, startOffset), offeredOutfitLimit).map(outfitOf),
      accessorySetsByFormality(composed.day.eligible),
    ), recentWorn),
  });
}

export type OutfitsAroundPins = Readonly<{
  status: 'composed';
  /** At most three. Empty only when no outfit at all is valid for the day, which is a failure instead. */
  outfits: readonly OutfitCandidate[];
  /** The largest set of pins one valid outfit wears, earlier pins winning a tie. */
  satisfiedPins: readonly OutfitPin[];
  /** The rest: no valid outfit wears them together with the satisfied ones. */
  unsatisfiedPins: readonly OutfitPin[];
}>;

/**
 * Compose around the pins, keeping as many as any valid outfit can wear together. The valid
 * drafts are judged and sorted once; each subset of pins is a predicate on them, taken after
 * the sort and before the order, the diversity rule and the accessories, because the 24 Today
 * offers hold the pin in none of their outfits more often than not. The reader's own pieces
 * always show, so the recently worn exclusion does not apply, and the three picks are the most
 * that can differ. Whatever pins fit no valid outfit are reported back for the caller to put
 * into the best pick, which the weather then calls unusual, exactly as a manual change does.
 */
export function composeOutfitsAroundPins(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
  startOffset: number,
  pins: readonly OutfitPin[],
): OutfitCompositionFailure | OutfitsAroundPins {
  const composed = composeDay(requirements, candidates);
  if (composed.status === 'failure') return composed;
  for (const subset of pinSubsets(pins)) {
    const pinned = composed.valid.filter(({ side, footwear }) =>
      outfitWearsPins(draftArrangement(side, footwear), subset));
    if (pinned.length === 0) continue;
    return Object.freeze({
      status: 'composed',
      outfits: Object.freeze(withAccessories(
        selectDiverseOutfits(orderForOffer(pinned, startOffset), composedOutfitLimit).map(outfitOf),
        accessorySetsByFormality(composed.day.eligible),
      )),
      satisfiedPins: Object.freeze(subset),
      unsatisfiedPins: Object.freeze(pins.filter((pin) => !subset.includes(pin))),
    });
  }
  // The empty subset wears every valid draft, and there is at least one.
  throw new Error('A valid composition set is never empty.');
}
