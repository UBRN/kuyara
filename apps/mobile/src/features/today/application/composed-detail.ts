import type { DressStyle } from '@kuyara/contracts';
import { useCallback } from 'react';

import type { ClothingPreference } from '@/domain/preferences';
import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import type {
  ComposeAroundInput,
  ComposedOption,
} from '@/features/recommendation/application/compose-around-pieces';
import type { RecommendedOutfit } from '@/features/recommendation/application/recommend-outfits';
import {
  useComposeAroundPieces,
  type ComposeAroundPieces,
} from '@/features/recommendation/application/use-compose-around-pieces';
import { useManualMix, type ManualMix } from '@/features/recommendation/application/use-manual-mix';
import type { RecommendationSnapshot } from '@/features/recommendation/application/recommendation-repository';
import { localDayKind } from '@/features/recommendation/domain/local-day';
import { outfitGarments, swappableSlots, type SwappableSlot } from '@/features/recommendation/domain/manual-mix';
import type {
  AccessoryOutfitSlot,
  OutfitCandidate,
  OutfitSlot,
} from '@/features/recommendation/domain/outfit-composition';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { wornOutfitOrNull } from '@/features/today/application/outfit-detail-state';
import type { ComposePiece } from '@/features/today/application/compose-selection';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';

/**
 * What compose around chosen pieces reads from the day Today was built for: its requirements,
 * profile preference, day seed and style, with the day's resolved dress style when there is
 * one, and the kind of day the reader is on at `now`, which labels the picks as Today's are.
 * Null when the snapshot cannot say, and then nothing is composed.
 */
export function composeInputFor(
  snapshot: Pick<RecommendationSnapshot, 'clothingPreference' | 'dressStyle' | 'styleAesthetics' | 'dayVariant'> | null,
  requirements: ClothingRequirements | null,
  resolvedDressStyle: DressStyle | null,
  now: number,
): ComposeAroundInput | null {
  if (!snapshot || !requirements || snapshot.dayVariant === null) return null;
  return {
    requirements,
    clothingPreference: snapshot.clothingPreference,
    dayVariant: snapshot.dayVariant,
    dressStyle: resolvedDressStyle ?? snapshot.dressStyle,
    styleAesthetics: snapshot.styleAesthetics,
    dayKind: localDayKind(new Date(now)),
  };
}

/**
 * The outfit detail shows and edits: kuyara's pick, or a result composed around chosen pieces
 * once there is one, on the day `composeInputFor` reads from `snapshot` (null composes
 * nothing). Each showing keeps its own edits, so an edit never crosses between the pick and a
 * composed option, even one built from the same pieces with the same id. `onPieceChanged`
 * hears each change to one piece, told whether a composed result is showing; `onComposed`
 * hears each settled compose attempt with the pieces chosen and the outfits built.
 */
export function useDetailMix(
  pick: RecommendedOutfit | null,
  requirements: ClothingRequirements | null,
  preference: ClothingPreference | null,
  snapshot: Parameters<typeof composeInputFor>[0],
  resolvedDressStyle: DressStyle | null,
  now: number,
  reports: Readonly<{
    onPieceChanged?: (slot: OutfitSlot, composed: boolean) => void;
    onComposed?: (pieceCount: number, optionCount: number) => void;
  }> = {},
): Readonly<{ composed: ComposeAroundPieces; manualMix: ManualMix<RecommendedOutfit> | null }> {
  const composed = useComposeAroundPieces(
    composeInputFor(snapshot, requirements, resolvedDressStyle, now), reports.onComposed);
  const option = composed.current;
  const { onPieceChanged } = reports;
  const composedShowing = option !== null;
  const pieceChanged = useCallback((slot: OutfitSlot) => onPieceChanged?.(slot, composedShowing),
    [composedShowing, onPieceChanged]);
  const manualMix = useManualMix(option?.outfit ?? pick, requirements, preference, option?.unusual ?? false,
    option ? composed.key : undefined, pieceChanged);
  return { composed, manualMix };
}

/** The pick's drawn pieces in slot order: what the compose sheet offers first. */
export function composePiecesOf(outfit: OutfitCandidate): readonly ComposePiece[] {
  const garments = outfitGarments(outfit);
  return swappableSlots.flatMap((slot) => {
    const garmentTypeId = garments[slot];
    return garmentTypeId === undefined ? [] : [{ slot, garmentTypeId }];
  });
}

export type ComposedDetail = Readonly<{
  /** The option as composed: what the reader's later edits count against, and its colours' source. */
  outfit: RecommendedOutfit;
  /** The reader's edits to the composed option, drawn pieces and finishing touches. */
  changedSlots: readonly OutfitSlot[];
  /** The reader's pieces still worn as chosen: their rows read "your choice". */
  pinnedSlots: readonly OutfitSlot[];
  /** Their colours, drawn as each piece's recorded swatch. */
  pieceColors: Readonly<Partial<Record<OutfitSlot, GarmentSwatchId>>>;
}>;

/**
 * A composed option as detail shows it. Nothing on it is "changed" until the reader changes it:
 * the rest of the outfit is kuyara's answer around the chosen pieces, never a change to
 * kuyara's pick. A pinned piece the reader changed afterwards is no longer the reader's chosen
 * piece, so it loses its colour and its "your choice".
 */
export function composedDetail(
  option: ComposedOption,
  editedSlots: readonly SwappableSlot[],
  editedAccessorySlots: readonly AccessoryOutfitSlot[],
): ComposedDetail {
  const pinnedSlots = option.pinnedSlots.filter((slot) => !editedSlots.includes(slot));
  const pieceColors: Partial<Record<OutfitSlot, GarmentSwatchId>> = {};
  for (const slot of pinnedSlots) {
    const swatchId = option.pieceColors[slot];
    if (swatchId !== undefined) pieceColors[slot] = swatchId;
  }
  return {
    outfit: option.outfit,
    changedSlots: [...editedSlots, ...editedAccessorySlots],
    pinnedSlots,
    pieceColors,
  };
}

/**
 * Phase 7's manual mix on detail: the changed arrangement of one option, evaluated by the
 * domain, and the slots the person changed. The option keeps its id and archetype.
 */
export type ManualDetail = Readonly<{
  optionId: string;
  outfit: RecommendedOutfit;
  /**
   * What the changes count against and the kept colours come from: kuyara's pick when absent,
   * a composed option when the outfit was built around chosen pieces. A composed one stands in
   * for the pick even before any change.
   */
  original?: RecommendedOutfit;
  changedSlots: readonly OutfitSlot[];
  /** Colours the reader chose for pieces composed around (compose only): each piece's recorded swatch. */
  pieceColors?: Readonly<Partial<Record<OutfitSlot, GarmentSwatchId>>>;
}>;

export type DetailShowing = Readonly<{
  /** The composed option's view, or null while there is no composed result. */
  composed: ComposedDetail | null;
  /** The look "Wore this today" records: `manual` once the outfit is the reader's, else the pick as recommended. */
  worn: WornOutfit | null;
}>;

type DetailMix = Pick<ManualMix<RecommendedOutfit>, 'outfit' | 'edited' | 'changedSlots' | 'changedAccessorySlots'>;

/**
 * What the presentation draws in the opened option's place: the reader's outfit once it is a
 * composed result or carries an edit, or null while kuyara's pick shows as recommended.
 */
export function manualDetailOf(
  mix: DetailMix | null,
  composed: ComposedDetail | null,
  suggestionId: string | undefined,
): ManualDetail | null {
  return mix && suggestionId && (composed || mix.edited)
    ? {
        optionId: suggestionId,
        outfit: mix.outfit,
        original: composed?.outfit,
        changedSlots: composed ? composed.changedSlots : [...mix.changedSlots, ...mix.changedAccessorySlots],
        pieceColors: composed?.pieceColors,
      }
    : null;
}

/**
 * Whether the outfit on detail is the reader's own, and everything that follows from it. A
 * composed result is the reader's from the start and any edit makes it so, a finishing touch
 * alone included; a reset leaves neither, and kuyara's pick shows again as recommended.
 */
export function detailShowing(
  pick: RecommendedOutfit | null,
  option: ComposedOption | null,
  mix: DetailMix | null,
): DetailShowing {
  const composed = option && mix ? composedDetail(option, mix.changedSlots, mix.changedAccessorySlots) : null;
  const changedOutfit = mix && (option || mix.edited) ? mix.outfit : null;
  const worn = changedOutfit
    ? wornOutfitOrNull(changedOutfit, 'manual')
    : pick ? wornOutfitOrNull(pick) : null;
  return { composed, worn };
}
