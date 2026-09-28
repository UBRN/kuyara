import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SWAP_COMMIT_VELOCITY,
  swapCommitDirection,
  swapDragOffset,
  swapDragOpacities,
  swapEntryBox,
  swapExitOffset,
  swapPlateHeight,
  swapRubberBand,
  swapStride,
} from './swap-gesture.ts';

// Phase 7's board swap, vault motion-spec section 4: the thresholds a device run then feels.

test('a step is never under two touch targets and otherwise follows the focused piece', () => {
  assert.equal(swapStride(30), 88);
  assert.equal(swapStride(100), 100 * 1.05 + 12);
});

test('the rubber band is UIScrollView\'s: 120 pt past an end shows as 37.7 pt at an 88 pt stride', () => {
  assert.equal(Math.round(swapRubberBand(120, 88) * 10) / 10, 37.7);
  assert.equal(swapRubberBand(0, 88), 0);
});

test('a drag tracks the finger for one stride, resists beyond it, and resists wholly at an end', () => {
  // Finger left: the next candidate.
  assert.equal(swapDragOffset(-40, 88, true, true), -40);
  assert.equal(swapDragOffset(-120, 88, true, true), -(88 + swapRubberBand(32, 88)));
  assert.equal(swapDragOffset(-40, 88, true, false), -swapRubberBand(40, 88));
  // Finger right: the previous candidate.
  assert.equal(swapDragOffset(40, 88, false, true), swapRubberBand(40, 88));
  assert.equal(swapDragOffset(40, 88, true, false), 40);
});

test('a release commits at half a stride or on a flick in the drag\'s direction, and only toward a neighbour', () => {
  const stride = 88;
  // Distance.
  assert.equal(swapCommitDirection(-44, 0, stride, true, true), 1);
  assert.equal(swapCommitDirection(44, 0, stride, true, true), -1);
  assert.equal(swapCommitDirection(-43, 0, stride, true, true), 0);
  // Velocity: a flick in the drag's direction commits a short drag.
  assert.equal(swapCommitDirection(-12, -SWAP_COMMIT_VELOCITY, stride, true, true), 1);
  assert.equal(swapCommitDirection(-12, -(SWAP_COMMIT_VELOCITY - 1), stride, true, true), 0);
  // A flick against the drag cancels even past half a stride.
  assert.equal(swapCommitDirection(-60, SWAP_COMMIT_VELOCITY, stride, true, true), 0);
  // No neighbour in that direction: nothing to commit to.
  assert.equal(swapCommitDirection(-60, -900, stride, true, false), 0);
  assert.equal(swapCommitDirection(60, 900, stride, false, true), 0);
  assert.equal(swapCommitDirection(0, -900, stride, true, true), 0);
});

test('the outgoing piece leaves past the incoming one, and the incoming turns solid at the commit distance', () => {
  assert.equal(swapExitOffset(1, -10, 88), -88);
  assert.equal(swapExitOffset(1, -80, 88), -(80 + 44));
  assert.equal(swapExitOffset(-1, 20, 88), 88);
  assert.deepEqual(swapDragOpacities(-44, 88), { outgoing: 0.5, incoming: 1 });
  assert.deepEqual(swapDragOpacities(-22, 88), { outgoing: 0.75, incoming: 0.5 });
  assert.deepEqual(swapEntryBox({ x: 10, y: 20, w: 100, h: 60 }, { x: 0, y: 0, w: 80, h: 40 }), { x: 20, y: 30, w: 80, h: 40 });
});

test('the plate is held while a piece is focused and returns to its composed height at rest', () => {
  assert.equal(swapPlateHeight(320, null), 320);
  // A shorter stage while focused does not shrink it.
  assert.equal(swapPlateHeight(300, { held: 340, stage: 312, ringBottom: 250, labelHeight: 42 }), 340);
  // The ring and the focus label may need more.
  assert.equal(swapPlateHeight(300, { held: 340, stage: 312, ringBottom: 320, labelHeight: 42 }), 320 + 4 + 42);
});
