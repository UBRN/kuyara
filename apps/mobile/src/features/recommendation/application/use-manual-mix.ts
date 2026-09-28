import { useCallback, useMemo, useState } from 'react';

import type { ClothingPreference } from '@/domain/preferences';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import {
  applySwaps,
  availableCandidates,
  neighbourCandidate,
  normalizeSwaps,
  outfitGarments,
  outfitSwappableSlots,
  slotCandidates,
  type OutfitSwaps,
  type SlotCandidate,
  type SwappableSlot,
} from '@/features/recommendation/domain/manual-mix';
import type { OutfitCandidate } from '@/features/recommendation/domain/outfit-composition';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';

const NO_SWAPS: OutfitSwaps = Object.freeze({});

export type ManualMix<Outfit extends OutfitCandidate> = Readonly<{
  /** The outfit detail shows: kuyara's pick until a piece changes. */
  outfit: Outfit;
  changedSlots: readonly SwappableSlot[];
  unusual: boolean;
  /** Each slot's candidates in picker order, without pieces another slot is wearing now. */
  candidates: Readonly<Partial<Record<SwappableSlot, readonly SlotCandidate[]>>>;
  choose: (slot: SwappableSlot, garmentTypeId: GarmentTypeId) => void;
  /** One step through the slot's order; false at an end, where nothing changes. */
  step: (slot: SwappableSlot, direction: 1 | -1) => boolean;
  reset: () => void;
}>;

/**
 * Phase 7's manual mix for one open outfit. The swaps are transient screen state: they live
 * as long as the detail route that calls this hook, so leaving detail forgets them (owner
 * answer 4), and "Wore this today" is the only way they are ever recorded. The candidate
 * order is computed once per outfit; the changed outfit is re-evaluated by the domain on
 * every change.
 */
export function useManualMix<Outfit extends OutfitCandidate & Readonly<{ optionId: string }>>(
  outfit: Outfit | null,
  requirements: ClothingRequirements | null,
  preference: ClothingPreference | null,
): ManualMix<Outfit> | null {
  const [state, setState] = useState<Readonly<{ optionId: string | null; swaps: OutfitSwaps }>>({
    optionId: null, swaps: NO_SWAPS,
  });
  const optionId = outfit?.optionId ?? null;
  // A different outfit starts from kuyara's pick; its swaps never carry over.
  const swaps = state.optionId === optionId ? state.swaps : NO_SWAPS;
  const slots = useMemo(() => (outfit ? outfitSwappableSlots(outfit) : []), [outfit]);
  const baseCandidates = useMemo(() => (outfit && requirements && preference
    ? new Map(slots.map((slot) => [slot, slotCandidates(outfit, slot, requirements, preference)]))
    : null), [outfit, preference, requirements, slots]);
  const manual = useMemo(() => (outfit && requirements && preference
    ? applySwaps(outfit, swaps, requirements, preference)
    : null), [outfit, preference, requirements, swaps]);
  const candidates = useMemo(() => {
    if (!manual || !baseCandidates) return {};
    const garments = outfitGarments(manual.outfit);
    return Object.fromEntries(slots.map((slot) =>
      [slot, availableCandidates(baseCandidates.get(slot) ?? [], slot, garments)]));
  }, [baseCandidates, manual, slots]);

  const choose = useCallback((slot: SwappableSlot, garmentTypeId: GarmentTypeId) => {
    if (!outfit) return;
    setState((current) => ({
      optionId: outfit.optionId,
      swaps: normalizeSwaps(outfit, {
        ...(current.optionId === outfit.optionId ? current.swaps : NO_SWAPS),
        [slot]: garmentTypeId,
      }),
    }));
  }, [outfit]);
  const step = useCallback((slot: SwappableSlot, direction: 1 | -1) => {
    const current = manual ? outfitGarments(manual.outfit)[slot] : undefined;
    const next = current === undefined
      ? null
      : neighbourCandidate(candidates[slot] ?? [], current, direction);
    if (next === null) return false;
    choose(slot, next);
    return true;
  }, [candidates, choose, manual]);
  const reset = useCallback(() => setState({ optionId: null, swaps: NO_SWAPS }), []);

  return useMemo(() => (manual ? {
    outfit: manual.outfit,
    changedSlots: manual.changedSlots,
    unusual: manual.unusual,
    candidates,
    choose,
    step,
    reset,
  } : null), [candidates, choose, manual, reset, step]);
}
