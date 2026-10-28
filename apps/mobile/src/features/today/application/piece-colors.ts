import { useCallback, useMemo, useState } from 'react';

import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { wornPieceColorsSchema } from '@/features/recommendation/domain/outfit-history';

/** The colours the reader painted on detail, by slot: each piece's recorded swatch. */
export type PaintedColors = Readonly<Partial<Record<OutfitSlot, GarmentSwatchId>>>;

type Paints = Readonly<Partial<Record<OutfitSlot, Readonly<{ garmentTypeId: GarmentTypeId; swatchId: GarmentSwatchId }>>>>;
const NO_PAINTS: Paints = Object.freeze({});

/** The painted colours that still hold: a slot whose piece changed since is coloured afresh. */
export function paintedColors(paints: Paints, garments: Readonly<Partial<Record<OutfitSlot, GarmentTypeId>>>): PaintedColors {
  return Object.fromEntries(Object.entries(paints).flatMap(([slot, paint]) =>
    paint && garments[slot as OutfitSlot] === paint.garmentTypeId ? [[slot, paint.swatchId]] : []));
}

/**
 * The colours that paint over the ones pieces are `drawn` in, or undefined when none does: a
 * colour equal to the drawn one is no paint.
 */
export function paintedOver(colors: PaintedColors, drawn: PaintedColors): PaintedColors | undefined {
  const painted = Object.entries(colors).filter(([slot, swatchId]) => drawn[slot as OutfitSlot] !== swatchId);
  return painted.length > 0 ? Object.fromEntries(painted) : undefined;
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
   * `drawnSwatchId` is the swatch the piece is drawn in unpainted: that colour is no paint, so it
   * changes nothing and clears an earlier paint of the same piece.
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
 * first showing as it opens: the worn hero's look in the colours it was recorded in.
 */
export function usePieceColors(
  key: string | null,
  garments: Readonly<Partial<Record<OutfitSlot, GarmentTypeId>>>,
  start: PaintedColors = {},
): PieceColors {
  const [state, setState] = useState<Readonly<{ key: string | null; paints: Paints }>>(() => ({
    key,
    paints: Object.fromEntries(Object.entries(start).flatMap(([slot, swatchId]) => {
      const garmentTypeId = garments[slot as OutfitSlot];
      return garmentTypeId ? [[slot, { garmentTypeId, swatchId }]] : [];
    })),
  }));
  const paints = state.key === key ? state.paints : NO_PAINTS;
  const colors = useMemo(() => paintedColors(paints, garments), [garments, paints]);
  const paint = useCallback((slot: OutfitSlot, garmentTypeId: GarmentTypeId, swatchId: GarmentSwatchId,
    drawnSwatchId: GarmentSwatchId | undefined) =>
    setState((previous) => {
      const paints = { ...(previous.key === key ? previous.paints : NO_PAINTS) };
      if (garments[slot] === garmentTypeId && swatchId === drawnSwatchId) delete paints[slot];
      else paints[slot] = { garmentTypeId, swatchId };
      return { key, paints };
    }), [garments, key]);
  const clear = useCallback(() => setState({ key: null, paints: NO_PAINTS }), []);
  return useMemo(() => ({ colors, paint, clear }), [clear, colors, paint]);
}
