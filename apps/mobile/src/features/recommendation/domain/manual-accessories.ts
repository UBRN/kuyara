import type { ClothingPreference } from '@/domain/preferences';
import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  accessoryOutfitSlots,
  assignAccessory,
  offeredAccessoriesBySlot,
  type AccessoryOutfitSlot,
  type OutfitAccessories,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import { garmentFitsSlot } from '@/features/recommendation/domain/outfit-history';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';

/**
 * Detail edit: the finishing touches are the reader's to change (ADR 0026 section 6). The
 * engine never sees an edit and the Closet never supplies one; an accessory is any of the
 * catalog's, one per accessory slot, and it never counts against the outfit's weather
 * verdict, so an accessory that answers nothing today is still allowed.
 *
 * An edit names the slot's whole state: `null` takes the slot's accessory off, an id puts
 * that accessory there. Anything that would only restore kuyara's own is not an edit.
 */
export type AccessoryEdits = Readonly<Partial<Record<AccessoryOutfitSlot, GarmentTypeId | null>>>;

export const NO_ACCESSORY_EDITS: AccessoryEdits = Object.freeze({});

/** One catalog accessory a slot may take, and whether it answers a requirement of today's weather. */
export type AccessoryCandidate = Readonly<{ garmentTypeId: GarmentTypeId; answersToday: boolean }>;

function garmentIdIn(accessories: OutfitAccessories, slot: AccessoryOutfitSlot): GarmentTypeId | null {
  return accessories[slot]?.garment.garmentTypeId ?? null;
}

/**
 * Every catalog accessory by the slot it fills. The ones that answer a requirement today come
 * first, in the composer's own order, then the rest in catalog order. The profile's gender
 * applicability filters them as it filters every other piece.
 */
export function accessoryCandidates(
  requirements: ClothingRequirements,
  preference: ClothingPreference,
): Readonly<Record<AccessoryOutfitSlot, readonly AccessoryCandidate[]>> {
  const types = listGarmentTypesForPreference(preference).map(({ typeId }) => typeId);
  const offered = offeredAccessoriesBySlot(types.map((typeId) =>
    evaluateGarmentEligibility(requirements, projectCatalogEffectiveGarment(typeId, preference))));
  return Object.freeze(Object.fromEntries(accessoryOutfitSlots.map((slot) => {
    const answering = offered[slot].map(({ garment }) => garment.garmentTypeId);
    const others = types.filter((typeId) => garmentFitsSlot(slot, typeId) && !answering.includes(typeId));
    return [slot, Object.freeze([
      ...answering.map((garmentTypeId) => Object.freeze({ garmentTypeId, answersToday: true })),
      ...others.map((garmentTypeId) => Object.freeze({ garmentTypeId, answersToday: false })),
    ])];
  })) as Record<AccessoryOutfitSlot, readonly AccessoryCandidate[]>);
}

/** Drops every edit that changes nothing; a piece that does not fit its slot is a caller bug. */
export function normalizeAccessoryEdits(outfit: OutfitCandidate, edits: AccessoryEdits): AccessoryEdits {
  return Object.freeze(Object.fromEntries(accessoryOutfitSlots.flatMap((slot) => {
    const edit = edits[slot];
    if (edit === undefined || edit === garmentIdIn(outfit.accessories, slot)) return [];
    if (edit !== null && !garmentFitsSlot(slot, edit)) {
      throw new Error(`${edit} is not an accessory for the ${slot} slot.`);
    }
    return [[slot, edit]];
  })));
}

/**
 * The slots whose accessory differs from kuyara's: `removed` where kuyara chose one and it is
 * gone or replaced, `added` where an accessory now stands that kuyara did not choose. A
 * replaced slot is in both. Slots come in the stable slot order.
 */
export function accessoryChanges(
  outfit: OutfitCandidate,
  edits: AccessoryEdits,
): Readonly<{ removed: readonly AccessoryOutfitSlot[]; added: readonly AccessoryOutfitSlot[] }> {
  const effective = normalizeAccessoryEdits(outfit, edits);
  const edited = accessoryOutfitSlots.filter((slot) => effective[slot] !== undefined);
  return Object.freeze({
    removed: edited.filter((slot) => outfit.accessories[slot] !== null),
    added: edited.filter((slot) => effective[slot] !== null),
  });
}

/**
 * The finishing touches an outfit shows once the edits apply: the edited slots rebuilt from
 * the catalog, every other slot kuyara's own object. Without an edit it is the same object.
 */
export function applyAccessoryEdits(
  outfit: OutfitCandidate,
  edits: AccessoryEdits,
  requirements: ClothingRequirements,
  preference: ClothingPreference,
): OutfitAccessories {
  const effective = normalizeAccessoryEdits(outfit, edits);
  if (accessoryOutfitSlots.every((slot) => effective[slot] === undefined)) return outfit.accessories;
  return Object.freeze(Object.fromEntries(accessoryOutfitSlots.map((slot) => {
    const edit = effective[slot];
    if (edit === undefined) return [slot, outfit.accessories[slot]];
    return [slot, edit === null ? null : assignAccessory(slot, evaluateGarmentEligibility(
      requirements, projectCatalogEffectiveGarment(edit, preference)))];
  })) as OutfitAccessories);
}
