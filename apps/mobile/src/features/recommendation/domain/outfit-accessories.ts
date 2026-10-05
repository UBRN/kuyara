import type { Formality } from '@/features/catalog/domain/garment-taxonomy';
import {
  compareGarmentEligibilityResults,
  type EligibleGarmentResult,
  type GarmentEligibilityResult,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  asEligibleDraftPart,
  formalityRankOf,
} from '@/features/recommendation/domain/outfit-evaluation';
import {
  assignedGarment,
  formalityOrder,
  type AssignedOutfitGarment,
  type OutfitAccessories,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-model';
import {
  accessoryOutfitSlots,
  slotAccepts,
  type AccessoryOutfitSlot,
} from '@/features/recommendation/domain/outfit-slots';

// The accessories a day finishes its outfits with, chosen once per formality and attached
// to the outfits that are shown.

/**
 * The accessories a day offers at all: eligible, structurally an accessory, and answering
 * at least one requirement the day actually derived. On a day that asks nothing of the head,
 * the neck, the hands or the rain this is empty and no outfit finishes with anything.
 */
function offeredAccessories(
  candidates: readonly EligibleGarmentResult[],
): readonly EligibleGarmentResult[] {
  return candidates.filter(
    (candidate) =>
      candidate.garment.properties.category === 'accessory' &&
      candidate.evaluations.some(({ status }) => status !== 'not_applicable'),
  );
}

function accessoriesOfSlot(
  accessories: readonly EligibleGarmentResult[],
  slot: AccessoryOutfitSlot,
): readonly EligibleGarmentResult[] {
  return accessories.filter(({ garment }) => slotAccepts(slot, garment.properties));
}

/**
 * The accessories that answer a requirement today, by the slot each one fills: the ones the
 * composer would offer for that slot on this day, best first. Detail's accessory picker lists
 * them first. Candidates that are not eligible, or that answer nothing the day asked, are
 * left out; on a day that asks nothing of the head, neck, hands or rain, every slot is empty.
 */
export function offeredAccessoriesBySlot(
  candidates: readonly GarmentEligibilityResult[],
): Readonly<Record<AccessoryOutfitSlot, readonly EligibleGarmentResult[]>> {
  const offered = offeredAccessories(
    candidates
      .filter((candidate): candidate is EligibleGarmentResult => candidate.status === 'eligible')
      .sort(compareGarmentEligibilityResults),
  );
  return Object.freeze(Object.fromEntries(
    accessoryOutfitSlots.map((slot) => [slot, accessoriesOfSlot(offered, slot)]),
  ) as Record<AccessoryOutfitSlot, readonly EligibleGarmentResult[]>);
}

function formalityDistance(
  result: EligibleGarmentResult,
  outfitRank: number,
): number {
  const rank = formalityRankOf(result);
  return rank < 0 ? Number.MAX_SAFE_INTEGER : Math.abs(rank - outfitRank);
}

/**
 * One accessory for one slot, or none. The slot's own region decides who may fill it, the
 * closest formality decides which one fills the slot, except that cold head protection
 * takes priority over formality. Where a region offers
 * a single garment the formality step never excludes it: gloves and the umbrella belong to
 * a casual outfit exactly as much as to a formal one.
 */
function accessoryForSlot(
  accessories: readonly EligibleGarmentResult[],
  slot: AccessoryOutfitSlot,
  formality: Formality,
): AssignedOutfitGarment | null {
  const offered = accessoriesOfSlot(accessories, slot);
  if (offered.length === 0) {
    return null;
  }

  const outfitRank = formalityOrder.indexOf(formality);
  const chosen = offered.reduce((best, candidate) => {
    const suitability = best.score - candidate.score;
    const order = formalityDistance(candidate, outfitRank) -
      formalityDistance(best, outfitRank);
    const better = slot === 'head'
      ? suitability < 0 || (suitability === 0 && (order < 0 ||
        (order === 0 && compareGarmentEligibilityResults(candidate, best) < 0)))
      : order < 0 || (order === 0 && compareGarmentEligibilityResults(candidate, best) < 0);
    return better ? candidate : best;
  });

  return assignedGarment(chosen, slot, null);
}

/**
 * Nothing but its formality distinguishes one composed outfit's accessories from another's,
 * so the day's answer is decided once for each of the three formalities instead of once for
 * each of the tens of thousands of outfits a mild day composes.
 */
export function accessorySetsByFormality(
  candidates: readonly EligibleGarmentResult[],
): ReadonlyMap<Formality, OutfitAccessories> {
  const sets = new Map<Formality, OutfitAccessories>();
  const accessories = offeredAccessories(candidates);
  if (accessories.length === 0) {
    return sets;
  }

  for (const formality of formalityOrder) {
    const chosen = Object.freeze(
      Object.fromEntries(
        accessoryOutfitSlots.map((slot) => [
          slot,
          accessoryForSlot(accessories, slot, formality),
        ]),
      ),
    ) as OutfitAccessories;
    if (accessoryOutfitSlots.some((slot) => chosen[slot] !== null)) {
      sets.set(formality, chosen);
    }
  }

  return sets;
}

function accessoryCompositionKey(accessories: OutfitAccessories): string {
  return accessoryOutfitSlots
    .map((slot) => accessories[slot]?.garment.candidateKey ?? '-')
    .join('|');
}

/**
 * Attachment, once per composed outfit and after the sort, so the order the six body slots
 * earned is the order the offer sees. A day that offers no accessory hands its outfits back
 * untouched, and only then does the composition key stay what it was.
 */
export function withAccessories(
  outfits: readonly OutfitCandidate[],
  sets: ReadonlyMap<Formality, OutfitAccessories>,
): readonly OutfitCandidate[] {
  if (sets.size === 0) {
    return outfits;
  }

  return outfits.map((outfit) => {
    const accessories = sets.get(outfit.formality);
    return accessories
      ? Object.freeze({
          ...outfit,
          accessories,
          compositionKey:
            `${outfit.compositionKey}|${accessoryCompositionKey(accessories)}`,
        })
      : outfit;
  });
}

/**
 * One accessory a person put on in detail, built as the composer builds one it attached. An
 * accessory that does not answer today's weather is still wearable and never changes the
 * outfit's verdict: accessories are not part of the arrangement.
 */
export function assignAccessory(
  slot: AccessoryOutfitSlot,
  result: GarmentEligibilityResult,
): AssignedOutfitGarment {
  return assignedGarment(asEligibleDraftPart(result), slot, null);
}
