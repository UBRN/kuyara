import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SWAP_COMMIT_VELOCITY,
  SWAP_GROW_MAX,
  SWAP_GROW_MIN,
  SWAP_STEP_BACK,
  SWAP_STRIP_COLUMNS,
  swapCommitDirection,
  swapDragOffset,
  swapDragZone,
  swapEntryBox,
  swapExitOffset,
  swapGrownBox,
  swapGrowScale,
  swapHeldStage,
  swapMarkerPosition,
  swapRubberBand,
  swapScaledBox,
  swapStride,
  swapStripLayout,
  swapWindow,
} from './swap-gesture.ts';

// Phase 7b's board swap, vault phase-7b final-spec sections 4, 5 and 10: the geometry and
// thresholds a device run then feels.

const apart = (a, b, gap) =>
  a.x >= b.x + b.w + gap || b.x >= a.x + a.w + gap || a.y >= b.y + b.h + gap || b.y >= a.y + a.h + gap;

test('the grid holds at most seven tiles a row, in ceil(n / 7) rows, and never wider than the column', () => {
  for (let n = 1; n <= 21; n += 1) {
    const strip = swapStripLayout(n, n, 361);
    assert.equal(strip.rows, Math.ceil(n / SWAP_STRIP_COLUMNS));
    assert.equal(strip.width, 356);
    assert.ok(strip.width <= 361);
    for (let row = 0; row < strip.rows; row += 1) {
      assert.ok(strip.tiles.filter(({ y }) => y === row * 52).length <= SWAP_STRIP_COLUMNS);
    }
    assert.equal(strip.height, strip.rows * 44 + (strip.rows - 1) * 8);
    assert.ok(strip.tiles.every(({ x }) => x + 44 <= strip.width));
  }
  // Today's most, 13, is two rows; 14 still fits two.
  assert.equal(swapStripLayout(13, 9, 361).rows, 2);
  assert.equal(swapStripLayout(14, 9, 361).height, 2 * 44 + 8);
  // A narrower column (a 375 pt phone) takes as many tiles as fit, never a sideways scroller.
  const narrow = swapStripLayout(13, 9, 343);
  assert.equal(narrow.columns, 6);
  assert.ok(narrow.width <= 343);
});

test('the hairline stands before the first unsuitable tile, after the row above at a row start, and not at all at an end', () => {
  // Mid-row: in the gap before tile 3.
  assert.deepEqual(swapStripLayout(12, 3, 361).hairline, { x: 3 * 52 - 4 - 0.5, y: 10 });
  // Row start: after the seventh tile of the row above, still inside a 361 pt column.
  const rowStart = swapStripLayout(12, 7, 361).hairline;
  assert.deepEqual(rowStart, { x: 359.5, y: 10 });
  assert.ok(rowStart.x + 1 <= 361);
  assert.equal(swapStripLayout(12, 0, 361).hairline, null);
  assert.equal(swapStripLayout(12, 12, 361).hairline, null);
});

test('the grow scale clears every stepped-back piece by spacing.sm, or is the floor', () => {
  const stage = { stageWidth: 358, stageHeight: 400 };
  // A lone piece with room grows the full 2x.
  assert.equal(swapGrowScale([{ box: { x: 150, y: 150, w: 50, h: 50 }, others: [], ...stage }]), SWAP_GROW_MAX);
  // A close neighbour limits it; the result still clears it by 8.
  const box = { x: 100, y: 100, w: 60, h: 60 };
  const other = { x: 189, y: 100, w: 60, h: 60 };
  const scale = swapGrowScale([{ box, others: [other], ...stage }]);
  assert.ok(scale > SWAP_GROW_MIN && scale < SWAP_GROW_MAX);
  assert.ok(apart(swapGrownBox(box, scale, 358, 400), swapScaledBox(other, SWAP_STEP_BACK), 8));
  assert.ok(!apart(swapGrownBox(box, scale + 0.01, 358, 400), swapScaledBox(other, SWAP_STEP_BACK), 8));
  // The tightest candidate decides for the whole slot, and a crowded one takes the floor.
  const crowded = { box, others: [{ x: 165, y: 100, w: 60, h: 60 }], ...stage };
  assert.equal(swapGrowScale([{ box, others: [], ...stage }, crowded]), SWAP_GROW_MIN);
});

test('the grown box stays on the stage', () => {
  assert.deepEqual(swapGrownBox({ x: 0, y: 0, w: 50, h: 40 }, 2, 358, 400), { x: 0, y: 0, w: 100, h: 80 });
  assert.deepEqual(swapGrownBox({ x: 300, y: 350, w: 50, h: 40 }, 2, 358, 400), { x: 258, y: 320, w: 100, h: 80 });
});

test('the held stage is the tallest candidate stage', () => {
  assert.equal(swapHeldStage([312, 348.5, 330]), 348.5);
});

test('the paging window never covers a stepped-back piece and reaches at most a touch target beside the grown box', () => {
  const grown = { x: 120, y: 20, w: 100, h: 140 };
  const open = swapWindow(grown, [], 358, 300);
  assert.deepEqual(open, { x: 76, y: 0, w: 188, h: 300, padLeft: 44, padRight: 44 });
  const left = { x: 20, y: 30, w: 80, h: 80 };
  const right = { x: 240, y: 200, w: 60, h: 60 };
  const tight = swapWindow(grown, [left, right], 358, 300);
  assert.equal(tight.x, 100);
  assert.equal(tight.x + tight.w, 240);
  for (const other of [left, right]) assert.ok(apart(tight, other, 0));
  assert.ok(tight.padLeft <= 44 && tight.padRight <= 44);
  // Never past the stage.
  const edge = swapWindow({ x: 10, y: 0, w: 100, h: 100 }, [], 358, 300);
  assert.equal(edge.x, 0);
  assert.equal(edge.padLeft, 10);
});

test('a step is the grown width plus the window pad on its side, never under two touch targets', () => {
  assert.equal(swapStride(30, 0), 88);
  assert.equal(swapStride(100, 44), 144);
  assert.equal(swapStride(100, 20), 120);
});

test('the drag zone is the grown piece with spacing.md around it, at least 88 square, inside the stage', () => {
  assert.deepEqual(swapDragZone({ x: 100, y: 100, w: 100, h: 100 }, 400), { x: 88, y: 88, w: 124, h: 124 });
  assert.deepEqual(swapDragZone({ x: 100, y: 0, w: 20, h: 20 }, 400), { x: 66, y: 0, w: 88, h: 54 });
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
  assert.equal(swapCommitDirection(-44, 0, stride, true, true), 1);
  assert.equal(swapCommitDirection(44, 0, stride, true, true), -1);
  assert.equal(swapCommitDirection(-43, 0, stride, true, true), 0);
  assert.equal(swapCommitDirection(-12, -SWAP_COMMIT_VELOCITY, stride, true, true), 1);
  assert.equal(swapCommitDirection(-12, -(SWAP_COMMIT_VELOCITY - 1), stride, true, true), 0);
  // A flick against the drag cancels even past half a stride.
  assert.equal(swapCommitDirection(-60, SWAP_COMMIT_VELOCITY, stride, true, true), 0);
  assert.equal(swapCommitDirection(-60, -900, stride, true, false), 0);
  assert.equal(swapCommitDirection(60, 900, stride, false, true), 0);
  assert.equal(swapCommitDirection(0, -900, stride, true, true), 0);
});

test('the outgoing piece leaves past the incoming one, which enters centred where the slot\'s piece stood', () => {
  assert.equal(swapExitOffset(1, -10, 88), -88);
  assert.equal(swapExitOffset(1, -80, 88), -(80 + 44));
  assert.equal(swapExitOffset(-1, 20, 88), 88);
  assert.deepEqual(swapEntryBox({ x: 10, y: 20, w: 100, h: 60 }, { x: 0, y: 0, w: 80, h: 40 }), { x: 20, y: 30, w: 80, h: 40 });
});

test('the marker follows the finger within a row and waits on its tile across a row break', () => {
  assert.deepEqual(swapMarkerPosition({ x: 52, y: 0 }, { x: 104, y: 0 }, 0.5), { x: 78, y: 0 });
  assert.deepEqual(swapMarkerPosition({ x: 312, y: 0 }, { x: 0, y: 52 }, 0.8), { x: 312, y: 0 });
  assert.deepEqual(swapMarkerPosition({ x: 52, y: 0 }, null, 0.8), { x: 52, y: 0 });
});
