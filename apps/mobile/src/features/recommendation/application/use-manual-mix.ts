import { useCallback, useMemo, useState } from 'react';

import type { ClothingPreference } from '@/domain/preferences';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  NO_MANUAL_EDITS,
  withAccessoriesPutBack,
  withAccessory,
  withAccessoryOff,
  withLayerOff,
  withPiece,
  type ManualEdits,
} from '@/features/recommendation/application/manual-edit-state';
import {
  accessoryCandidates as listAccessoryCandidates,
  type AccessoryCandidate,
} from '@/features/recommendation/domain/manual-accessories';
import {
  applySwaps,
  availableCandidates,
  neighbourCandidate,
  outfitCandidateSlots,
  outfitGarments,
  removableSlots,
  slotCandidates,
  type RemovableSlot,
  type SlotCandidate,
  type SwappableSlot,
} from '@/features/recommendation/domain/manual-mix';
import {
  accessoryOutfitSlots,
  type AccessoryOutfitSlot,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';

type EditState = Readonly<{ key: string | null; edits: ManualEdits }>;
const NO_EDITS: EditState = Object.freeze({ key: null, edits: NO_MANUAL_EDITS });

export type ManualMix<Outfit extends OutfitCandidate> = Readonly<{
  /** The outfit detail shows: kuyara's pick until something changes. */
  outfit: Outfit;
  /** The drawn slots that differ from kuyara's pick: swapped, taken off and added. */
  changedSlots: readonly SwappableSlot[];
  /** Layers kuyara wore that the reader took off: each keeps its row as "no layer". */
  removedSlots: readonly RemovableSlot[];
  /** Layer slots kuyara left free that now hold a piece. */
  addedSlots: readonly RemovableSlot[];
  /** Layer slots with no piece right now, removed or never worn: "add a layer" opens the picker for one. */
  freeLayerSlots: readonly RemovableSlot[];
  /** Accessory slots whose accessory differs from kuyara's. */
  changedAccessorySlots: readonly AccessoryOutfitSlot[];
  /** Accessory slots where kuyara chose one and it is gone or replaced. */
  removedAccessorySlots: readonly AccessoryOutfitSlot[];
  /** How many of kuyara's finishing touches are gone: the "you took off N" line and its put-back. */
  removedAccessoryCount: number;
  /** Accessory slots that now hold one kuyara did not choose: each reads "added". */
  addedAccessorySlots: readonly AccessoryOutfitSlot[];
  /** Accessory slots with nothing in them right now: "add an accessory" offers these. */
  freeAccessorySlots: readonly AccessoryOutfitSlot[];
  /** Anything differs from the pick, a drawn piece or a finishing touch: what "changed" and "Wore this today" read. */
  edited: boolean;
  unusual: boolean;
  /** Each slot's candidates in picker order, without pieces another slot is wearing now. Free layer slots are included; "wear without" is never one. */
  candidates: Readonly<Partial<Record<SwappableSlot, readonly SlotCandidate[]>>>;
  /** Every catalog accessory by slot, the ones answering today's weather first. */
  accessoryCandidates: Readonly<Record<AccessoryOutfitSlot, readonly AccessoryCandidate[]>>;
  /** Puts a piece in a slot. On a free layer slot it adds the layer. */
  choose: (slot: SwappableSlot, garmentTypeId: GarmentTypeId) => void;
  /** One step through the slot's order; false at an end or on a free slot, where nothing changes. */
  step: (slot: SwappableSlot, direction: 1 | -1) => boolean;
  /** Takes a mid or an outer layer off. Nothing else leaves with it. */
  removeLayer: (slot: RemovableSlot) => void;
  /** Adds a piece to a free layer slot; a slot that holds a piece is left alone. */
  addLayer: (slot: RemovableSlot, garmentTypeId: GarmentTypeId) => void;
  /** Takes the slot's accessory off, kuyara's or one the reader added. */
  removeAccessory: (slot: AccessoryOutfitSlot) => void;
  /** Gives back every finishing touch of kuyara's that was taken off or replaced; added ones stay. */
  putBackAccessories: () => void;
  /** Puts an accessory in a free accessory slot; an occupied slot is left alone. */
  addAccessory: (slot: AccessoryOutfitSlot, garmentTypeId: GarmentTypeId) => void;
  /** Forgets every change: kuyara's pick again. */
  reset: () => void;
}>;

/**
 * Phase 7's manual mix for one open outfit. The edits are transient screen state: they live
 * as long as the detail route that calls this hook, so leaving detail forgets them,
 * and "Wore this today" is the only way they are ever recorded. The candidate
 * order is computed once per outfit; the changed outfit is re-evaluated by the domain on
 * every change. `baseUnusual` is the verdict of an outfit that is unusual before any edit.
 * The edits belong to `editKey`, the outfit's option id unless the caller names the showing
 * itself: a composed option can share kuyara's pick's id, and its edits must never cross.
 */
export function useManualMix<Outfit extends OutfitCandidate & Readonly<{ optionId: string }>>(
  outfit: Outfit | null,
  requirements: ClothingRequirements | null,
  preference: ClothingPreference | null,
  baseUnusual = false,
  editKey: string | null = outfit?.optionId ?? null,
): ManualMix<Outfit> | null {
  const [state, setState] = useState<EditState>(NO_EDITS);
  // A different outfit, or another showing of one, starts from its own pick; edits never carry over.
  const edits = state.key === editKey ? state.edits : NO_MANUAL_EDITS;
  const slots = useMemo(() => (outfit ? outfitCandidateSlots(outfit) : []), [outfit]);
  const baseCandidates = useMemo(() => (outfit && requirements && preference
    ? new Map(slots.map((slot) => [slot, slotCandidates(outfit, slot, requirements, preference)]))
    : null), [outfit, preference, requirements, slots]);
  const accessories = useMemo(() => (requirements && preference
    ? listAccessoryCandidates(requirements, preference)
    : null), [preference, requirements]);
  const manual = useMemo(() => (outfit && requirements && preference
    ? applySwaps(outfit, edits.swaps, requirements, preference, { accessories: edits.accessories, baseUnusual })
    : null), [baseUnusual, edits, outfit, preference, requirements]);
  const candidates = useMemo(() => {
    if (!manual || !baseCandidates) return {};
    const garments = outfitGarments(manual.outfit);
    return Object.fromEntries(slots.map((slot) =>
      [slot, availableCandidates(baseCandidates.get(slot) ?? [], slot, garments)]));
  }, [baseCandidates, manual, slots]);

  const edit = useCallback((change: (base: Outfit, current: ManualEdits) => ManualEdits) => {
    if (!outfit) return;
    setState((previous) => ({
      key: editKey,
      edits: change(outfit, previous.key === editKey ? previous.edits : NO_MANUAL_EDITS),
    }));
  }, [editKey, outfit]);
  const choose = useCallback((slot: SwappableSlot, garmentTypeId: GarmentTypeId) =>
    edit((base, current) => withPiece(base, current, slot, garmentTypeId)), [edit]);
  const removeLayer = useCallback((slot: RemovableSlot) =>
    edit((base, current) => withLayerOff(base, current, slot)), [edit]);
  const addLayer = useCallback((slot: RemovableSlot, garmentTypeId: GarmentTypeId) => {
    if (manual && outfitGarments(manual.outfit)[slot] === undefined) choose(slot, garmentTypeId);
  }, [choose, manual]);
  const step = useCallback((slot: SwappableSlot, direction: 1 | -1) => {
    const current = manual ? outfitGarments(manual.outfit)[slot] : undefined;
    const next = current === undefined
      ? null
      : neighbourCandidate(candidates[slot] ?? [], current, direction);
    if (next === null) return false;
    choose(slot, next);
    return true;
  }, [candidates, choose, manual]);
  const removeAccessory = useCallback((slot: AccessoryOutfitSlot) =>
    edit((base, current) => withAccessoryOff(base, current, slot)), [edit]);
  const putBackAccessories = useCallback(() =>
    edit((base, current) => withAccessoriesPutBack(base, current)), [edit]);
  const addAccessory = useCallback((slot: AccessoryOutfitSlot, garmentTypeId: GarmentTypeId) => {
    if (manual && manual.outfit.accessories[slot] === null) {
      edit((base, current) => withAccessory(base, current, slot, garmentTypeId));
    }
  }, [edit, manual]);
  const reset = useCallback(() => setState(NO_EDITS), []);

  return useMemo(() => (manual && accessories ? {
    outfit: manual.outfit,
    changedSlots: manual.changedSlots,
    removedSlots: manual.removedSlots,
    addedSlots: manual.addedSlots,
    freeLayerSlots: removableSlots.filter((slot) => outfitGarments(manual.outfit)[slot] === undefined),
    changedAccessorySlots: manual.changedAccessorySlots,
    removedAccessorySlots: manual.removedAccessorySlots,
    removedAccessoryCount: manual.removedAccessorySlots.length,
    addedAccessorySlots: manual.addedAccessorySlots,
    freeAccessorySlots: accessoryOutfitSlots.filter((slot) => manual.outfit.accessories[slot] === null),
    edited: manual.edited,
    unusual: manual.unusual,
    candidates,
    accessoryCandidates: accessories,
    choose,
    step,
    removeLayer,
    addLayer,
    removeAccessory,
    putBackAccessories,
    addAccessory,
    reset,
  } : null), [accessories, addAccessory, addLayer, candidates, choose, manual, putBackAccessories, removeAccessory,
    removeLayer, reset, step]);
}
