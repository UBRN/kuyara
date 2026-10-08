import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';

import type { ComposedPiece, DrawnBox, GarmentBoardPiece } from './garment-board';
import {
  SWAP_STEP_BACK,
  swapDragZone,
  swapEntryBox,
  swapGrownBox,
  swapGrowScale,
  swapHeldStage,
  swapScaledBox,
  swapStageFit,
  swapStride,
  swapWindow,
} from './swap-gesture';
import {
  neighbourIn,
  withGarment,
  type Box,
  type Candidates,
  type Composed,
  type GarmentSwapCandidate,
  type Grow,
  type Pager,
} from './swap-reconcile';

/** A composition in stage-width units, as `composePieces` returns it. */
export type Composition = Readonly<{
  order: readonly ComposedPiece[];
  stack: readonly ComposedPiece[];
  boxes: ReadonlyMap<ComposedPiece, DrawnBox>;
  stageHeight: number;
}>;

/** Composes pieces in board points at the board's width, `fit` that much narrower. */
export type Composer = (pieces: readonly GarmentBoardPiece[], fit: number) => Composed;

/** A grow with the strip height and the visible height it was fitted to. */
export type Enlargement = Grow & Readonly<{ panel: number; visible: number }>;

export const lerp = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};

export const lerpBox = (a: Box, b: Box, t: number): Box => {
  'worklet';
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
};

export const insideBox = (box: Box, x: number, y: number) =>
  x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;

/** The composition in points; `fit` composes it that much narrower, centred in `width`. */
export function placeComposition(result: Composition, width: number, fit = 1): Composed {
  const size = width * fit;
  const left = (width - size) / 2;
  const bySlot = new Map<OutfitSlot, Readonly<{ piece: ComposedPiece; box: Box }>>();
  for (const piece of result.order) {
    const box = result.boxes.get(piece)!;
    bySlot.set(piece.slot, { piece, box: { x: left + box.x * size, y: box.y * size, w: box.w * size, h: box.h * size } });
  }
  return {
    bySlot,
    order: result.order.map(({ slot }) => slot),
    stack: result.stack.map(({ slot }) => slot),
    height: result.stageHeight * size,
  };
}

/**
 * Where Today's band, `band` points wide and centred on this `width`-point board, drew each
 * piece, by slot, in this board's width units. `bandBoxes` are the band's own boxes in its
 * width units.
 */
export function bandBoxesOnBoard(bandBoxes: ReadonlyMap<OutfitSlot, DrawnBox>, band: number, width: number) {
  const inset = (band - width) / 2;
  return new Map([...bandBoxes].map(([slot, box]) => [slot, {
    x: (box.x * band - inset) / width, y: (box.y * band) / width, w: (box.w * band) / width, h: (box.h * band) / width,
  }]));
}

/**
 * One enlargement's grow scale and held stage: every candidate of the slot composed with the
 * rest of the outfit.
 */
export function growFor(
  enlarged: Readonly<{
    pieces: readonly GarmentBoardPiece[];
    slot: OutfitSlot;
    order: readonly GarmentSwapCandidate[];
    current: Composed;
    width: number;
    large: boolean;
    fit: number;
  }>,
  compose: Composer,
): Grow {
  const { pieces, slot, order, current, width, large, fit } = enlarged;
  const layouts = order.map((candidate) => {
    const composed = compose(withGarment(pieces, slot, candidate), fit);
    return {
      box: composed.bySlot.get(slot)!.box,
      others: composed.order.filter((other) => other !== slot).map((other) => composed.bySlot.get(other)!.box),
      stageWidth: width,
      stageHeight: composed.height,
    };
  });
  const own = {
    box: current.bySlot.get(slot)!.box,
    others: current.order.filter((other) => other !== slot).map((other) => current.bySlot.get(other)!.box),
    stageWidth: width,
    stageHeight: current.height,
  };
  const all = [own, ...layouts];
  const scale = swapGrowScale(all);
  return { slot, width, large, fit, scale, held: swapHeldStage(all, scale) };
}

/**
 * The enlargement of `slot` at the board's rest composition. The stage never shrinks while
 * the enlargement moves between slots (`keptHeld`, the moving enlargement's held stage before
 * its fit). Where the stage and the strip would not fit the visible height, the whole board
 * composes just narrow enough while the piece is enlarged.
 */
export function enlargementFor(
  enlarged: Readonly<{
    pieces: readonly GarmentBoardPiece[];
    slot: OutfitSlot;
    order: readonly GarmentSwapCandidate[];
    rest: Composed;
    width: number;
    large: boolean;
    panel: number;
    visible: number;
    keptHeld: number;
  }>,
  compose: Composer,
): Enlargement {
  const { pieces, slot, order, rest, width, large, panel, visible, keptHeld } = enlarged;
  const full = growFor({ pieces, slot, order, current: rest, width, large, fit: 1 }, compose);
  const fullHeld = Math.max(full.held, rest.height, keptHeld);
  const fit = swapStageFit(fullHeld, panel, visible);
  const fitted = fit < 1
    ? growFor({ pieces, slot, order, current: compose(pieces, fit), width, large, fit }, compose) : full;
  return { ...fitted, held: fullHeld * fit, panel, visible };
}

/** Whether `grow` was made for this slot, board and strip, so it still holds. */
export const enlargementHolds = (
  grow: Enlargement,
  wanted: Readonly<{ slot: OutfitSlot; width: number; large: boolean; panel: number; visible: number }>,
) => grow.slot === wanted.slot && grow.width === wanted.width && grow.large === wanted.large
  && grow.panel === wanted.panel && grow.visible === wanted.visible;

/** Where the slot's two neighbours stand before a drag: each centred on the slot's piece. */
export function neighbourBoxes(
  enlarged: Readonly<{
    pieces: readonly GarmentBoardPiece[];
    composed: Composed;
    slot: OutfitSlot;
    garmentTypeId: GarmentTypeId | undefined;
    candidates: Candidates;
    fit: number;
  }>,
  compose: Composer,
): Readonly<Record<1 | -1, Box | null>> {
  const { pieces, composed, slot, garmentTypeId, candidates, fit } = enlarged;
  const current = composed.bySlot.get(slot)?.box;
  const boxOf = (direction: 1 | -1) => {
    const neighbour = current && garmentTypeId ? neighbourIn(candidates, slot, garmentTypeId, direction) : null;
    if (!current || !neighbour) return null;
    return swapEntryBox(current, compose(withGarment(pieces, slot, neighbour), fit).bySlot.get(slot)!.box);
  };
  return { [1]: boxOf(1), [-1]: boxOf(-1) };
}

/** The enlarged piece's grown box, its paging window, each side's stride and its drag zone. */
export function pagerFor(
  composed: Composed,
  slot: OutfitSlot,
  grow: Grow,
  width: number,
  neighbours: Readonly<Record<1 | -1, Box | null>>,
  outline: number,
): Pager | null {
  const own = composed.bySlot.get(slot);
  if (!own) return null;
  const grown = swapGrownBox(own.box, grow.scale, width, grow.held);
  const steppedBack = composed.order.filter((other) => other !== slot)
    .map((other) => swapScaledBox(composed.bySlot.get(other)!.box, SWAP_STEP_BACK));
  const window = swapWindow(grown, steppedBack, width, grow.held, outline);
  // Each side's step keeps that side's neighbour, grown and outlined, wholly behind the window's edge.
  const incoming = (direction: 1 | -1) => {
    const box = neighbours[direction];
    return box ? swapGrownBox(box, grow.scale, width, grow.held) : grown;
  };
  return {
    grown,
    window,
    strideNext: swapStride(window, incoming(1), 1, outline),
    stridePrevious: swapStride(window, incoming(-1), -1, outline),
    zone: swapDragZone(grown, grow.held),
  };
}
