import { layout, spacing } from '@/theme/theme';

// Phase 7's board swap (vault motion-spec section 4.1). These are the gesture's own
// constants: every duration and spring the swap moves on is the theme's, by role.

/** The focused piece grows this much: "slightly", inside the functional ceiling of 1.05. */
export const SWAP_FOCUS_SCALE = 1.05;
/** One slop decides tap versus drag, and a horizontal drag versus a vertical scroll. */
export const SWAP_TOUCH_SLOP = 10;
/** A release past half a step commits it. */
export const SWAP_COMMIT_DISTANCE = 0.5;
/** A flick in the drag's direction commits one step at any distance past the slop, in pt/s. */
export const SWAP_COMMIT_VELOCITY = 500;
/** UIScrollView's rubber-band coefficient. */
export const SWAP_RUBBER_BAND = 0.55;
/** A drag never starts this close to the screen's left edge, which keeps the system back swipe. */
export const SWAP_EDGE_GUARD = 24;

type Box = Readonly<{ x: number; y: number; w: number; h: number }>;

/** One candidate step: never under two touch targets, so a small boot never commits at 22 pt. */
export function swapStride(boxWidth: number): number {
  'worklet';
  return Math.max(2 * layout.minimumTouchTarget, boxWidth * SWAP_FOCUS_SCALE + spacing.md);
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

/**
 * Drag visuals: the outgoing piece fades as it leaves and the incoming one turns solid
 * exactly at the commit distance, where the label already names it.
 */
export function swapDragOpacities(shown: number, stride: number): Readonly<{ outgoing: number; incoming: number }> {
  'worklet';
  const progress = Math.min(1, Math.abs(shown) / stride);
  return { outgoing: 1 - progress, incoming: Math.min(1, progress / SWAP_COMMIT_DISTANCE) };
}

/** An incoming piece's first box: its own size, centred where the slot's piece stood. */
export function swapEntryBox(from: Box, to: Box): Box {
  return { x: from.x + from.w / 2 - to.w / 2, y: from.y + from.h / 2 - to.h / 2, w: to.w, h: to.h };
}

/**
 * The plate while a piece is focused never shrinks below its height at focus start, so the
 * content under the board does not bob on every step; it grows when the stage, the ring or
 * the focus label needs more. At rest it is the composed height.
 */
export function swapPlateHeight(
  rest: number,
  focus: Readonly<{ held: number; stage: number; ringBottom: number; labelHeight: number }> | null,
): number {
  if (!focus) return rest;
  return Math.max(focus.held, focus.stage, focus.ringBottom + spacing.xs + focus.labelHeight);
}
