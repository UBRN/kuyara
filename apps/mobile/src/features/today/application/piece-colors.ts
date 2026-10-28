import { useCallback, useMemo, useState } from 'react';

import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { wornPieceColorsSchema } from '@/features/recommendation/domain/outfit-history';

/** The colours the reader painted on detail, by slot: each piece's recorded swatch. */
export type PaintedColors = Readonly<Partial<Record<OutfitSlot, GarmentSwatchId>>>;

/** Painted colours with the piece each was painted on: a paint holds only while that piece is worn. */
export type Paints = Readonly<Partial<Record<OutfitSlot, Readonly<{ garmentTypeId: GarmentTypeId; swatchId: GarmentSwatchId }>>>>;
const NO_PAINTS: Paints = Object.freeze({});

/** `colors` painted on the pieces `garments` wears. */
export function paintsOn(colors: PaintedColors, garments: Readonly<Partial<Record<OutfitSlot, GarmentTypeId>>>): Paints {
  return Object.fromEntries(Object.entries(colors).flatMap(([slot, swatchId]) => {
    const garmentTypeId = garments[slot as OutfitSlot];
    return garmentTypeId ? [[slot, { garmentTypeId, swatchId }]] : [];
  }));
}

/** The painted colours that still hold: a slot whose piece changed since is coloured afresh. */
export function paintedColors(paints: Paints, garments: Readonly<Partial<Record<OutfitSlot, GarmentTypeId>>>): PaintedColors {
  return Object.fromEntries(Object.entries(paints).flatMap(([slot, paint]) =>
    paint && garments[slot as OutfitSlot] === paint.garmentTypeId ? [[slot, paint.swatchId]] : []));
}

/** Painted colours as the detail route carries them: `slot.swatch` pairs joined by commas. */
export function pieceColorsParam(colors: PaintedColors): string {
  return Object.entries(colors).map(([slot, swatchId]) => `${slot}.${swatchId}`).join(',');
}

/** The colours a detail route parameter names, or none when it names no valid slot and swatch. */
export function pieceColorsFromParam(value: string | undefined): PaintedColors {
  const parsed = wornPieceColorsSchema.safeParse(
    Object.fromEntries((value ?? '').split(',').map((pair) => pair.split('.'))));
  return parsed.success ? parsed.data : {};
}

export type PieceColors = Readonly<{
  colors: PaintedColors;
  /**
   * Paints the slot's piece; the colour only paints the drawing and never enters selection.
   * `drawnSwatchId` is the swatch a piece of `garmentTypeId` is drawn in unpainted in the slot:
   * that colour is no paint, so it changes nothing and clears the slot's earlier paint.
   */
  paint: (slot: OutfitSlot, garmentTypeId: GarmentTypeId, swatchId: GarmentSwatchId,
    drawnSwatchId: GarmentSwatchId | undefined) => void;
  /** Forgets every painted colour: "Back to kuyara's pick". */
  clear: () => void;
}>;

/**
 * The colours the reader paints on detail, transient like the manual mix: they belong to one
 * showing (`key`), so a composed result never inherits the pick's, and leaving detail forgets
 * them. Nothing is stored until "Wore this today" records the colours drawn. `start` paints the
 * showing until the reader first paints or clears: the worn hero's look in the colours it was
 * recorded in, on the pick's own pieces.
 */
export function usePieceColors(
  key: string | null,
  garments: Readonly<Partial<Record<OutfitSlot, GarmentTypeId>>>,
  start: Paints = NO_PAINTS,
): PieceColors {
  // Null until the reader first paints or clears.
  const [state, setState] = useState<Readonly<{ key: string | null; paints: Paints }> | null>(null);
  const paints = state === null ? start : state.key === key ? state.paints : NO_PAINTS;
  const colors = useMemo(() => paintedColors(paints, garments), [garments, paints]);
  const paint = useCallback((slot: OutfitSlot, garmentTypeId: GarmentTypeId, swatchId: GarmentSwatchId,
    drawnSwatchId: GarmentSwatchId | undefined) =>
    setState((previous) => {
      const paints = { ...(previous === null ? start : previous.key === key ? previous.paints : NO_PAINTS) };
      if (swatchId === drawnSwatchId) delete paints[slot];
      else paints[slot] = { garmentTypeId, swatchId };
      return { key, paints };
    }), [key, start]);
  const clear = useCallback(() => setState({ key: null, paints: NO_PAINTS }), []);
  return useMemo(() => ({ colors, paint, clear }), [clear, colors, paint]);
}

/**
 * The piece colours as they count (`counted`, from `detailShowing`). Paints that count as no
 * change are gone, so the next paint starts from none: the board as kuyara's pick.
 */
export function countedPieceColors(pieceColors: PieceColors, counted: PaintedColors): PieceColors {
  if (counted === pieceColors.colors) return pieceColors;
  return {
    ...pieceColors,
    colors: counted,
    paint: (...args) => {
      pieceColors.clear();
      pieceColors.paint(...args);
    },
  };
}
