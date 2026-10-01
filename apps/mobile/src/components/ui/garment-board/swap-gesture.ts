import { borderWidths, layout, spacing } from '@/theme/theme';

// Phase 7b's board swap (vault phase-7b final-spec sections 4 and 5). These are the gesture's
// own constants and geometry: every duration and spring the swap moves on is the theme's, by role.

/** The tapped piece grows to twice its composed size where the board holds it ... */
export const SWAP_GROW_MAX = 2;
/** ... and never less than this, whatever the board holds. */
export const SWAP_GROW_MIN = 1.6;
/** The other pieces step back to this scale, in full colour. */
export const SWAP_STEP_BACK = 0.9;
/** A shrinking piece hands back to its resting drawing once its scale has travelled this share. */
export const SWAP_HANDOFF_AFTER = 0.25;
/** Candidate tiles a row: seven 44 pt tiles with `spacing.sm` between them fill 356 pt. */
export const SWAP_STRIP_COLUMNS = 7;
/** One slop decides tap versus drag. */
export const SWAP_TOUCH_SLOP = 10;
/** A release past half a step commits it. */
export const SWAP_COMMIT_DISTANCE = 0.5;
/** A flick in the drag's direction commits one step at any distance past the slop, in pt/s. */
export const SWAP_COMMIT_VELOCITY = 500;
/** UIScrollView's rubber-band coefficient. */
export const SWAP_RUBBER_BAND = 0.55;
/** A drag never starts this close to the screen's left edge, which keeps the system back swipe. */
export const SWAP_EDGE_GUARD = 24;
/** The hairline before the first unsuitable tile. */
export const SWAP_HAIRLINE_LENGTH = 24;
/** How far the one-time swipe hint shows the neighbour past the window's edge, in pt. */
export const SWAP_HINT_PEEK = 32;

export type SwapBox = Readonly<{ x: number; y: number; w: number; h: number }>;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

/** A box scaled about its centre: a stepped-back piece. */
export function swapScaledBox(box: SwapBox, scale: number): SwapBox {
  const w = box.w * scale;
  const h = box.h * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

/** The enlarged piece's box: grown about its centre, then shifted just enough to stay on the stage. */
export function swapGrownBox(box: SwapBox, scale: number, stageWidth: number, stageHeight: number): SwapBox {
  const w = box.w * scale;
  const h = box.h * scale;
  return {
    x: clamp(box.x + box.w / 2 - w / 2, 0, stageWidth - w),
    y: clamp(box.y + box.h / 2 - h / 2, 0, stageHeight - h),
    w,
    h,
  };
}

const apart = (a: SwapBox, b: SwapBox, gap: number) =>
  a.x >= b.x + b.w + gap || b.x >= a.x + a.w + gap || a.y >= b.y + b.h + gap || b.y >= a.y + a.h + gap;

/** One candidate composed with the rest of the outfit: its own box, the others' and the stage. */
export type SwapCandidateLayout = Readonly<{
  box: SwapBox;
  others: readonly SwapBox[];
  stageWidth: number;
  stageHeight: number;
}>;

/**
 * The slot's grow scale for one enlargement: the largest scale in 0.01 steps up to
 * `SWAP_GROW_MAX` at which every candidate, composed with the rest of the outfit and grown on
 * its stage, clears every stepped-back piece by `spacing.sm`; never under `SWAP_GROW_MIN`.
 */
export function swapGrowScale(layouts: readonly SwapCandidateLayout[]): number {
  let fit = SWAP_GROW_MAX;
  for (const { box, others, stageWidth, stageHeight } of layouts) {
    const back = others.map((other) => swapScaledBox(other, SWAP_STEP_BACK));
    let best = 1;
    for (let step = 101; step <= SWAP_GROW_MAX * 100; step += 1) {
      const grown = swapGrownBox(box, step / 100, stageWidth, stageHeight);
      if (!back.every((other) => apart(grown, other, spacing.sm))) break;
      best = step / 100;
    }
    fit = Math.min(fit, best);
  }
  return Math.max(SWAP_GROW_MIN, fit);
}

/**
 * The stage held for one enlargement: the tallest stage any candidate composes, so a change
 * never moves the tiles under a tapping finger.
 */
export function swapHeldStage(stageHeights: readonly number[]): number {
  return Math.max(0, ...stageHeights);
}

/**
 * The paging window: the grown box widened by a touch target each side, never past the stage
 * and never into a stepped-back piece standing entirely to one side; the held stage's height.
 */
export function swapWindow(
  grown: SwapBox,
  steppedBack: readonly SwapBox[],
  stageWidth: number,
  heldStage: number,
): SwapBox & Readonly<{ padLeft: number; padRight: number }> {
  let left = Math.max(0, grown.x - layout.minimumTouchTarget);
  let right = Math.min(stageWidth, grown.x + grown.w + layout.minimumTouchTarget);
  for (const other of steppedBack) {
    if (other.x + other.w <= grown.x) left = Math.max(left, other.x + other.w);
    else if (other.x >= grown.x + grown.w) right = Math.min(right, other.x);
  }
  return { x: left, y: 0, w: right - left, h: heldStage, padLeft: grown.x - left, padRight: right - (grown.x + grown.w) };
}

/**
 * One step on one side: the piece that comes in from that side waits behind the window's
 * edge, whatever its own grown width, so a wider neighbour never shows when a drag makes it
 * opaque; a step is never under two touch targets. With no neighbour on that side the
 * enlarged piece's own grown box stands in, which is its width plus the window's pad. The
 * ink edge is drawn half outside the box and anti-aliased, so the whole `outline` weight
 * stands between the box and the edge: a box exactly on the edge shows a line of it there.
 */
export function swapStride(
  window: Readonly<{ x: number; w: number }>,
  incoming: SwapBox,
  direction: 1 | -1,
  outline: number,
): number {
  const behind = direction === 1 ? window.x + window.w - incoming.x : incoming.x + incoming.w - window.x;
  return Math.max(2 * layout.minimumTouchTarget, behind + outline);
}

/** How far a resisted drag shows: 120 pt past an end shows as 37.7 pt at an 88 pt stride. */
export function swapRubberBand(offset: number, dimension: number): number {
  'worklet';
  return (offset * dimension * SWAP_RUBBER_BAND) / (dimension + SWAP_RUBBER_BAND * offset);
}

/**
 * The offset the piece shows for a raw finger offset (slop already removed). A negative
 * offset moves toward the next candidate. With a neighbour the first stride tracks the
 * finger 1:1 and anything beyond it resists; without one the whole offset resists.
 */
export function swapDragOffset(raw: number, stride: number, hasPrevious: boolean, hasNext: boolean): number {
  'worklet';
  const direction = raw < 0 ? 1 : raw > 0 ? -1 : 0;
  const has = direction === 1 ? hasNext : direction === -1 ? hasPrevious : false;
  const magnitude = Math.abs(raw);
  const sign = Math.sign(raw);
  if (!has) return sign * swapRubberBand(magnitude, stride);
  if (magnitude > stride) return sign * (stride + swapRubberBand(magnitude - stride, stride));
  return raw;
}

/**
 * Whether a release commits, and to which neighbour: 1 is the next candidate, -1 the
 * previous one, 0 springs home. A neighbour must exist in the offset's direction, and
 * either the shown offset reaches half a stride or the release velocity in that direction
 * reaches the flick threshold. A flick against the offset cancels.
 */
export function swapCommitDirection(
  shown: number,
  velocityX: number,
  stride: number,
  hasPrevious: boolean,
  hasNext: boolean,
): -1 | 0 | 1 {
  'worklet';
  const direction = shown < 0 ? 1 : shown > 0 ? -1 : 0;
  if (direction === 0) return 0;
  const has = direction === 1 ? hasNext : hasPrevious;
  if (!has) return 0;
  const towards = -direction * velocityX;
  // A flick back against the drag is the person changing their mind, whatever the distance.
  if (towards <= -SWAP_COMMIT_VELOCITY) return 0;
  const byDistance = Math.abs(shown) >= stride * SWAP_COMMIT_DISTANCE;
  return byDistance || towards >= SWAP_COMMIT_VELOCITY ? direction : 0;
}

/** Where the outgoing piece leaves to, so it never swings back across the incoming one. */
export function swapExitOffset(direction: 1 | -1, shown: number, stride: number): number {
  'worklet';
  return -direction * Math.max(stride, Math.abs(shown) + stride / 2);
}

/** An incoming piece's first box: its own size, centred where the slot's piece stood. */
export function swapEntryBox(from: SwapBox, to: SwapBox): SwapBox {
  return { x: from.x + from.w / 2 - to.w / 2, y: from.y + from.h / 2 - to.h / 2, w: to.w, h: to.h };
}

/**
 * Where a horizontal drag may start: the enlarged piece with `spacing.md` around it, at least
 * two targets square, inside the stage.
 */
export function swapDragZone(grown: SwapBox, heldStage: number): SwapBox {
  const minimum = 2 * layout.minimumTouchTarget;
  const w = Math.max(grown.w + 2 * spacing.md, minimum);
  const h = Math.max(grown.h + 2 * spacing.md, minimum);
  const x = grown.x + grown.w / 2 - w / 2;
  const top = Math.max(0, grown.y + grown.h / 2 - h / 2);
  const bottom = Math.min(heldStage, grown.y + grown.h / 2 + h / 2);
  return { x, y: top, w, h: bottom - top };
}

export type SwapStripLayout = Readonly<{
  tiles: readonly Readonly<{ x: number; y: number }>[];
  columns: number;
  rows: number;
  width: number;
  height: number;
  /** The hairline's top-left corner, or null when every tile or none is weather-suitable. */
  hairline: Readonly<{ x: number; y: number }> | null;
}>;

/**
 * The candidate grid under the enlarged piece: 44 pt tiles `spacing.sm` apart, left-aligned,
 * seven a row (356 pt) or as many as a narrower column holds, as many rows as the slot needs
 * and never a sideways scroller. The weather-suitable pieces come first; a hairline stands in
 * the gap before the first other piece or, when that piece starts a row, after the last tile
 * of the row above.
 */
export function swapStripLayout(count: number, suitableCount: number, columnWidth: number): SwapStripLayout {
  const tile = layout.minimumTouchTarget;
  const pitch = tile + spacing.sm;
  const columns = Math.max(1, Math.min(SWAP_STRIP_COLUMNS, Math.floor((columnWidth + spacing.sm) / pitch)));
  const tiles = Array.from({ length: count }, (_, index) => ({
    x: (index % columns) * pitch,
    y: Math.floor(index / columns) * pitch,
  }));
  const rows = Math.ceil(count / columns);
  const width = columns * pitch - spacing.sm;
  const height = rows > 0 ? rows * tile + (rows - 1) * spacing.sm : 0;
  let hairline: SwapStripLayout['hairline'] = null;
  if (suitableCount > 0 && suitableCount < count) {
    const first = tiles[suitableCount];
    const top = (tile - SWAP_HAIRLINE_LENGTH) / 2;
    hairline = first.x > 0
      ? { x: first.x - spacing.sm / 2 - borderWidths.subtle / 2, y: first.y + top }
      : { x: (columns - 1) * pitch + tile + spacing.sm / 2 - borderWidths.subtle / 2, y: first.y - pitch + top };
  }
  return { tiles, columns, rows, width, height, hairline };
}

/**
 * Where the strip's marker stands while a drag moves between two tiles: it travels with the
 * finger within a row and waits on its tile when the step crosses a row, so it never slides
 * diagonally under the finger.
 */
export function swapMarkerPosition(
  from: Readonly<{ x: number; y: number }>,
  to: Readonly<{ x: number; y: number }> | null,
  progress: number,
): Readonly<{ x: number; y: number }> {
  'worklet';
  if (!to || to.y !== from.y) return { x: from.x, y: from.y };
  const t = Math.min(1, Math.max(0, progress));
  return { x: from.x + (to.x - from.x) * t, y: from.y };
}

/**
 * How narrow the board composes while a piece is enlarged, as a share of its width: just
 * enough for `spacing.md` above the held stage, the stage, `spacing.md`, the strip and
 * `spacing.md` under it to fit the page's visible height, so every tile shows with the
 * whole enlarged piece clear of the navigation bar above it. Never under
 * 1 / `SWAP_GROW_MIN`, where the enlarged piece is still drawn at least at its resting size;
 * past that the page scrolls as before.
 */
export function swapStageFit(held: number, panelHeight: number, visibleHeight: number): number {
  if (!(held > 0) || !(visibleHeight > 0)) return 1;
  return clamp((visibleHeight - 3 * spacing.md - panelHeight) / held, 1 / SWAP_GROW_MIN, 1);
}

/**
 * How far the page scrolls when a piece is enlarged (final-spec section 3): the least that
 * shows the strip's bottom `spacing.md` above the visible bottom, never so far that the
 * enlarged piece's top comes within `spacing.md` of the visible top, and nothing when the
 * strip already shows.
 * `pieceTop` and `panelBottom` are in board points, `boardTop` and `visible` in window points.
 */
export function swapRevealScroll(
  area: Readonly<{ pieceTop: number; panelBottom: number }>,
  boardTop: number,
  visible: Readonly<{ top: number; bottom: number }>,
): number {
  const needed = boardTop + area.panelBottom + spacing.md - visible.bottom;
  return Math.max(0, Math.min(needed, boardTop + area.pieceTop - spacing.md - visible.top));
}
