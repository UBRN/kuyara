import { useMemo, useState } from 'react';

import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { easierToSee as easierToSeeValues } from '@/theme/easier-to-see';
import { layout, spacing } from '@/theme/theme';

import { composePieces, type GarmentBoardPiece } from './garment-board';
import { useGarmentCut } from './garment-cut';
import { swapStripLayout } from './swap-gesture';
import {
  enlargementFor,
  enlargementHolds,
  neighbourBoxes,
  pagerFor,
  placeComposition,
  type Composer,
  type Enlargement,
} from './swap-layout';
import type { Candidates } from './swap-reconcile';

/** A strip on screen: its slot and the stage held above it. */
export type SwapPanel = Readonly<{ slot: OutfitSlot; held: number }>;
/** The focus the strips follow, the strip of the enlarged piece and the one fading out. */
export type SwapPanels = Readonly<{ focus: OutfitSlot | null; current: SwapPanel | null; leaving: SwapPanel | null }>;

/**
 * The swap board's composition at rest and while a piece is enlarged, the enlarged piece's
 * pager, and the strips under the stage with the candidate a drag previews.
 */
export function useSwapPager({
  pieces, candidates, width, large, focusedSlot, visibleHeight, outline,
}: Readonly<{
  pieces: readonly GarmentBoardPiece[];
  candidates: Candidates;
  width: number;
  large: boolean;
  focusedSlot: OutfitSlot | null;
  visibleHeight: number;
  /** The outline drawn round each piece, which the paging window keeps inside it. */
  outline: number;
}>) {
  const cut = useGarmentCut();
  const compose: Composer = (next, nextFit) => placeComposition(composePieces(next, 'detail', cut, large), width, nextFit);
  const rest = useMemo(() => (width > 0 ? placeComposition(composePieces(pieces, 'detail', cut, large), width) : null),
    [cut, large, pieces, width]);

  // The strip's header before it has measured itself: Done's height.
  const headerMinimum = large ? easierToSeeValues.primaryActionHeight : layout.minimumTouchTarget;
  const [headerHeight, setHeaderHeight] = useState<number>(headerMinimum);
  // The strip: its candidates, tiles and the marker's tile.
  const stripCandidates = (slot: OutfitSlot) => candidates[slot] ?? [];
  const stripOf = (slot: OutfitSlot) => {
    const order = stripCandidates(slot);
    return swapStripLayout(order.length, order.filter(({ suitable }) => suitable).length, width);
  };
  const panelHeightOf = (slot: OutfitSlot) => headerHeight + spacing.sm + stripOf(slot).height;
  const measureHeader = (height: number) => {
    if (Math.abs(height - headerHeight) >= 0.5) setHeaderHeight(Math.max(headerMinimum, height));
  };

  // One enlargement's grow scale and held stage; the stage never shrinks while the
  // enlargement moves between slots. Where the stage and the strip would not fit the visible
  // height, the whole board composes just narrow enough while the piece is enlarged.
  const [panels, setPanels] = useState<SwapPanels>({ focus: null, current: null, leaving: null });
  const [grow, setGrow] = useState<Enlargement | null>(null);
  let enlargement: Enlargement | null = null;
  if (focusedSlot && rest && rest.bySlot.has(focusedSlot)) {
    const panel = panelHeightOf(focusedSlot);
    if (grow && enlargementHolds(grow, { slot: focusedSlot, width, large, panel, visible: visibleHeight })) {
      enlargement = grow;
    } else {
      enlargement = enlargementFor({
        pieces, slot: focusedSlot, order: stripCandidates(focusedSlot), rest, width, large, panel,
        visible: visibleHeight, keptHeld: panels.focus !== null && grow ? grow.held / grow.fit : 0,
      }, compose);
      setGrow(enlargement);
    }
  }
  const fit = enlargement?.fit ?? 1;
  const composed = useMemo(() => (width > 0 && fit < 1
    ? placeComposition(composePieces(pieces, 'detail', cut, large), width, fit) : rest),
    [cut, fit, large, pieces, rest, width]);
  const activeGrow = enlargement && composed
    ? { ...enlargement, held: Math.max(enlargement.held, composed.height) } : null;
  const pager = focusedSlot && composed && activeGrow
    ? pagerFor(composed, focusedSlot, activeGrow, width, neighbourBoxes({
      pieces, composed, slot: focusedSlot, garmentTypeId: composed.bySlot.get(focusedSlot)?.piece.garmentTypeId,
      candidates, fit,
    }, compose), outline)
    : null;

  // The strip follows the enlargement: it arrives with it, swaps when it moves, and stays
  // while it fades out after a settle. A drag the change cancelled names no piece any more.
  const [previewId, setPreviewId] = useState<GarmentTypeId | null>(null);
  if (panels.focus !== focusedSlot) {
    if (previewId !== null) setPreviewId(null);
    setPanels({
      focus: focusedSlot,
      current: focusedSlot && activeGrow ? { slot: focusedSlot, held: activeGrow.held } : panels.current,
      leaving: focusedSlot && panels.focus ? panels.current : null,
    });
  }

  return {
    compose, composed, fit, activeGrow, pager,
    panels, setPanels, previewId, setPreviewId,
    stripCandidates, stripOf, panelHeightOf, measureHeader,
  };
}
