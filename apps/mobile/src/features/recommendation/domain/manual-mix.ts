import type { ClothingPreference } from '@/domain/preferences';
import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
  type GarmentEligibilityResult,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  applyAccessoryEdits,
  accessoryChanges,
  NO_ACCESSORY_EDITS,
  type AccessoryEdits,
} from '@/features/recommendation/domain/manual-accessories';
import {
  accessoryOutfitSlots as accessoryOutfitSlotOrder,
  evaluateArrangement,
  garmentFitsSlot,
  onePieceExcludes,
  type AccessoryOutfitSlot,
  type OutfitCandidate,
  type OutfitPin,
} from '@/features/recommendation/domain/outfit-composition';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';

/**
 * Phase 7, manual mix (ADR 0026 section 6): on detail a person may change any drawn piece of
 * kuyara's pick for another catalog piece of the same slot, take a mid or an outer layer off,
 * put one on in a slot kuyara left free, and change the finishing touches (see
 * `manual-accessories.ts`). The recommendation engine never sees any of it, the Closet never
 * supplies a candidate, and nothing here is stored: only "Wore this today" records the
 * result, as a `manual` worn outfit.
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

/** The two slots a person may leave empty. Every other drawn piece is part of a complete outfit. */
export const removableSlots = Object.freeze(['mid_layer', 'outer_layer'] as const);
export type RemovableSlot = (typeof removableSlots)[number];

function isRemovable(slot: SwappableSlot): slot is RemovableSlot {
  return (removableSlots as readonly SwappableSlot[]).includes(slot);
}

/**
 * The reader's changes by slot: another piece, or `null` for a layer taken off. A layer slot
 * kuyara left free takes a piece the same way, which is how a layer is added.
 */
export type OutfitSwaps = Readonly<Partial<Record<SwappableSlot, GarmentTypeId | null>>>;

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

/**
 * The slots whose candidates the picker may need: the pieces kuyara drew, and both layer
 * slots whether or not kuyara filled them, since a free layer slot takes a piece.
 */
export function outfitCandidateSlots(outfit: OutfitCandidate): readonly SwappableSlot[] {
  const garments = outfitGarments(outfit);
  return swappableSlots.filter((slot) => garments[slot] !== undefined || isRemovable(slot));
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

/** The ids ranked for one slot: weather-suitable first, then the domain's score, then the catalog order. */
function rankSlot(
  garments: Readonly<Garments>,
  slot: SwappableSlot,
  ids: readonly GarmentTypeId[],
  requirements: ClothingRequirements,
  preference: ClothingPreference,
): readonly SlotCandidate[] {
  const rated = ids.map((garmentTypeId, order) => {
    const { outfit: arranged, suitable } = evaluate({ ...garments, [slot]: garmentTypeId }, requirements, preference);
    return { garmentTypeId, suitable, score: arranged.score, order };
  });
  rated.sort((left, right) => Number(right.suitable) - Number(left.suitable)
    || right.score - left.score || left.order - right.order);
  return Object.freeze(rated.map(({ garmentTypeId, suitable }) => Object.freeze({ garmentTypeId, suitable })));
}

/**
 * Every catalog piece one slot can take, in the order the picker and the board step through:
 * pieces that keep kuyara's pick weather-suitable first, then the rest. The profile's
 * gender applicability is the catalog filter the recommendation used, so a piece outside it
 * never appears; the Closet is never read. Within each group the domain's own score for the
 * resulting outfit decides, then the catalog order, so the order is stable. Computed once
 * per slot against kuyara's pick, so it never reshuffles while the person steps through it.
 * A layer slot kuyara left free lists the pieces that could fill it; "wear without" is the
 * picker's own first entry and never a candidate. A body slot the pick does not wear has none.
 */
export function slotCandidates(
  outfit: OutfitCandidate,
  slot: SwappableSlot,
  requirements: ClothingRequirements,
  preference: ClothingPreference,
): readonly SlotCandidate[] {
  const base = outfitGarments(outfit);
  const current = base[slot];
  if (current === undefined && !isRemovable(slot)) return Object.freeze([]);
  const types = listGarmentTypesForPreference(preference)
    .map(({ typeId }) => typeId)
    .filter((typeId) => garmentFitsSlot(slot, typeId));
  return rankSlot(base, slot, current === undefined || types.includes(current) ? types : [current, ...types],
    requirements, preference);
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

/**
 * Drops every swap that changes nothing: kuyara's own piece put back, a layer taken off that
 * kuyara did not wear, a body piece for a slot the pick does not draw. Only a layer can be
 * taken off or added; taking any other slot off is a caller bug and throws.
 */
export function normalizeSwaps(outfit: OutfitCandidate, swaps: OutfitSwaps): OutfitSwaps {
  const base = outfitGarments(outfit);
  return Object.freeze(Object.fromEntries(Object.entries(swaps).filter(([name, id]) => {
    const slot = name as SwappableSlot;
    if (id === undefined) return false;
    if (id === null) {
      if (!isRemovable(slot)) throw new Error(`Only a mid or outer layer can be taken off, not ${slot}.`);
      return base[slot] !== undefined;
    }
    return base[slot] !== id && (base[slot] !== undefined || isRemovable(slot));
  })));
}

export type ManualOutfit<Outfit extends OutfitCandidate> = Readonly<{
  /** The outfit on screen: kuyara's pick, or the changed arrangement with the pick's identity. */
  outfit: Outfit;
  /** The drawn slots that differ from kuyara's pick: swapped, taken off and added. */
  changedSlots: readonly SwappableSlot[];
  /** Layers kuyara wore that the reader took off. */
  removedSlots: readonly RemovableSlot[];
  /** Layer slots kuyara left free that now hold a piece. */
  addedSlots: readonly RemovableSlot[];
  /** Accessory slots whose accessory differs from kuyara's: taken off, added or replaced. */
  changedAccessorySlots: readonly AccessoryOutfitSlot[];
  /** Accessory slots where kuyara chose one and it is gone or replaced. */
  removedAccessorySlots: readonly AccessoryOutfitSlot[];
  /** Accessory slots that now hold one kuyara did not choose. */
  addedAccessorySlots: readonly AccessoryOutfitSlot[];
  /** Anything differs from the pick: a drawn piece or a finishing touch. "Wore this today" records `manual` when true. */
  edited: boolean;
  /** The domain rejects the changed set for today's weather: detail says so, and still allows it. */
  unusual: boolean;
}>;

export type ManualOptions = Readonly<{
  accessories?: AccessoryEdits;
  /**
   * The verdict of the outfit the edits start from, for a base that is itself already
   * unusual (compose around chosen pieces can end there). Re-evaluating the arrangement
   * replaces it whenever a drawn piece changes.
   */
  baseUnusual?: boolean;
}>;

/**
 * The outfit a set of edits produces, evaluated by the domain. It keeps the pick's option id
 * and archetype, so the screen, the palette and the worn record still know which
 * recommendation it came from; everything the composition decides (reasoning, trade-offs,
 * formality) is recomputed for the pieces now worn. The finishing touches are kuyara's own
 * unless the accessory edits change them, and they never enter the verdict.
 */
export function applySwaps<Outfit extends OutfitCandidate>(
  outfit: Outfit,
  swaps: OutfitSwaps,
  requirements: ClothingRequirements,
  preference: ClothingPreference,
  { accessories = NO_ACCESSORY_EDITS, baseUnusual = false }: ManualOptions = {},
): ManualOutfit<Outfit> {
  const effective = normalizeSwaps(outfit, swaps);
  const base = outfitGarments(outfit);
  const changedSlots = swappableSlots.filter((slot) => effective[slot] !== undefined);
  const removedSlots = removableSlots.filter((slot) => effective[slot] === null);
  const addedSlots = removableSlots.filter((slot) => base[slot] === undefined && typeof effective[slot] === 'string');
  const { removed, added } = accessoryChanges(outfit, accessories);
  const changedAccessorySlots = accessoryOutfitSlotOrder.filter((slot) => removed.includes(slot) || added.includes(slot));
  const summary = {
    changedSlots: Object.freeze(changedSlots),
    removedSlots: Object.freeze(removedSlots),
    addedSlots: Object.freeze(addedSlots),
    changedAccessorySlots: Object.freeze(changedAccessorySlots),
    removedAccessorySlots: removed,
    addedAccessorySlots: added,
    edited: changedSlots.length > 0 || changedAccessorySlots.length > 0,
  };
  const worn = applyAccessoryEdits(outfit, accessories, requirements, preference);
  if (changedSlots.length === 0) {
    return Object.freeze({
      ...summary,
      outfit: worn === outfit.accessories ? outfit : Object.freeze({ ...outfit, accessories: worn }),
      unusual: baseUnusual,
    });
  }
  const garments: Garments = { ...base };
  for (const slot of changedSlots) {
    const id = effective[slot];
    if (id === null || id === undefined) delete garments[slot];
    else garments[slot] = id;
  }
  const { outfit: arranged, suitable } = evaluate(garments, requirements, preference);
  return Object.freeze({
    ...summary,
    outfit: Object.freeze({ ...outfit, ...arranged, accessories: worn }),
    unusual: !suitable,
  });
}

export type PinnedPick<Outfit extends OutfitCandidate> = Readonly<{
  outfit: Outfit;
  unusual: boolean;
  /** The pins the arrangement wears, in the order given; a pin that could not sit with an earlier one is left out. */
  appliedPins: readonly OutfitPin[];
}>;

/**
 * Puts chosen pieces into kuyara's best pick when no valid outfit wears them: the weather
 * then judges the arrangement, and it is unusual exactly as a manual change is. A top or a
 * bottom pin takes a one piece out and a one-piece pin takes the top and the bottom out; the
 * missing half of a body is the best catalog piece for it. A layer pin uses the free layer
 * slot. A garment a pin brings in is never worn twice: a layer it duplicates is dropped, a
 * body piece is replaced. Earlier pins win a conflict; the pick's finishing touches stay.
 */
export function pinPieces<Outfit extends OutfitCandidate>(
  outfit: Outfit,
  pins: readonly OutfitPin[],
  requirements: ClothingRequirements,
  preference: ClothingPreference,
): PinnedPick<Outfit> {
  const garments: Garments = { ...outfitGarments(outfit) };
  const applied: OutfitPin[] = [];
  const kept = new Set<SwappableSlot>();
  const displaced: SwappableSlot[] = [];
  for (const pin of pins) {
    if (garments[pin.slot] === pin.garmentTypeId) {
      kept.add(pin.slot);
      applied.push(pin);
    }
  }
  for (const pin of pins) {
    if (kept.has(pin.slot)) continue;
    const bodyConflict = [...kept].some((slot) => onePieceExcludes(pin.slot, slot));
    const holder = swappableSlots.find((slot) => slot !== pin.slot && garments[slot] === pin.garmentTypeId);
    if (bodyConflict || (holder !== undefined && kept.has(holder))) continue;
    if (pin.slot === 'one_piece') { delete garments.primary_top; delete garments.bottom; }
    else if (pin.slot === 'primary_top' || pin.slot === 'bottom') delete garments.one_piece;
    garments[pin.slot] = pin.garmentTypeId;
    kept.add(pin.slot);
    applied.push(pin);
    if (holder !== undefined) displaced.push(holder);
  }
  const bestFor = (slot: SwappableSlot): GarmentTypeId => {
    const taken = new Set(swappableSlots.filter((other) => other !== slot).map((other) => garments[other]));
    const ids = listGarmentTypesForPreference(preference).map(({ typeId }) => typeId)
      .filter((typeId) => garmentFitsSlot(slot, typeId) && !taken.has(typeId));
    const [best] = rankSlot(garments, slot, ids, requirements, preference);
    if (!best) throw new Error(`No catalog piece is left for the ${slot} slot.`);
    return best.garmentTypeId;
  };
  for (const slot of displaced) {
    if (isRemovable(slot)) delete garments[slot];
    else garments[slot] = bestFor(slot);
  }
  if (garments.one_piece === undefined) {
    for (const slot of ['primary_top', 'bottom'] as const) garments[slot] ??= bestFor(slot);
  }
  const { outfit: arranged, suitable } = evaluate(garments, requirements, preference);
  return Object.freeze({
    outfit: Object.freeze({ ...outfit, ...arranged, accessories: outfit.accessories }),
    unusual: !suitable,
    appliedPins: Object.freeze(applied),
  });
}
