import { useCallback, useMemo, useState } from 'react';

import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';

/** The colours the reader painted on detail, by slot: each piece's recorded swatch. */
export type PaintedColors = Readonly<Partial<Record<OutfitSlot, GarmentSwatchId>>>;

type Paints = Readonly<Partial<Record<OutfitSlot, Readonly<{ garmentTypeId: GarmentTypeId; swatchId: GarmentSwatchId }>>>>;
const NO_PAINTS: Paints = Object.freeze({});

/** The painted colours that still hold: a slot whose piece changed since is coloured afresh. */
export function paintedColors(paints: Paints, garments: Readonly<Partial<Record<OutfitSlot, GarmentTypeId>>>): PaintedColors {
  return Object.fromEntries(Object.entries(paints).flatMap(([slot, paint]) =>
    paint && garments[slot as OutfitSlot] === paint.garmentTypeId ? [[slot, paint.swatchId]] : []));
}

export type PieceColors = Readonly<{
  colors: PaintedColors;
  /** Paints the slot's piece; the colour only paints the drawing and never enters selection. */
  paint: (slot: OutfitSlot, garmentTypeId: GarmentTypeId, swatchId: GarmentSwatchId) => void;
  /** Forgets every painted colour: "Back to kuyara's pick". */
  clear: () => void;
}>;

/**
 * The colours the reader paints on detail, transient like the manual mix: they belong to one
 * showing (`key`), so a composed result never inherits the pick's, and leaving detail forgets
 * them. Nothing is stored until "Wore this today" records the colours drawn.
 */
export function usePieceColors(
  key: string | null,
  garments: Readonly<Partial<Record<OutfitSlot, GarmentTypeId>>>,
): PieceColors {
  const [state, setState] = useState<Readonly<{ key: string | null; paints: Paints }>>({ key: null, paints: NO_PAINTS });
  const paints = state.key === key ? state.paints : NO_PAINTS;
  const colors = useMemo(() => paintedColors(paints, garments), [garments, paints]);
  const paint = useCallback((slot: OutfitSlot, garmentTypeId: GarmentTypeId, swatchId: GarmentSwatchId) =>
    setState((previous) => ({
      key,
      paints: { ...(previous.key === key ? previous.paints : NO_PAINTS), [slot]: { garmentTypeId, swatchId } },
    })), [key]);
  const clear = useCallback(() => setState({ key: null, paints: NO_PAINTS }), []);
  return useMemo(() => ({ colors, paint, clear }), [clear, colors, paint]);
}
