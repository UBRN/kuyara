import assert from 'node:assert/strict';
import test from 'node:test';

import { composeGarmentBoard, detailPreset } from './compose-garment-board.ts';
import { resolveGarmentSilhouette } from './garment-silhouette-map.ts';
import { SWAP_GROW_MAX, SWAP_GROW_MIN, SWAP_STEP_BACK, swapScaledBox, swapStripLayout } from './swap-gesture.ts';
import {
  bandBoxesOnBoard,
  enlargementFor,
  enlargementHolds,
  growFor,
  insideBox,
  lerpBox,
  neighbourBoxes,
  pagerFor,
  placeComposition,
} from './swap-layout.ts';

const WIDTH = 358;
const OUTLINE = 1.5;

const composition = (pieces) => composeGarmentBoard(pieces.map((piece) => ({
  ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category),
})), detailPreset);
const compose = (pieces, fit) => placeComposition(composition(pieces), WIDTH, fit);

const look = [
  { slot: 'primary_top', garmentTypeId: 'shirt', category: 'top' },
  { slot: 'bottom', garmentTypeId: 'jeans', category: 'bottom' },
  { slot: 'footwear', garmentTypeId: 'sandals', category: 'footwear' },
];
const footwear = ['sneakers', 'sandals', 'closed_shoes']
  .map((garmentTypeId) => ({ garmentTypeId, category: 'footwear', suitable: true }));
const candidates = { footwear };

test('a composition is placed in points, and a fit narrows it about the board\'s centre', () => {
  const units = composition(look);
  const full = placeComposition(units, WIDTH);
  const narrow = placeComposition(units, WIDTH, 0.8);
  assert.deepEqual(full.order, units.order.map(({ slot }) => slot));
  assert.deepEqual(full.stack, units.stack.map(({ slot }) => slot));
  assert.equal(full.height, units.stageHeight * WIDTH);
  assert.equal(narrow.height, units.stageHeight * WIDTH * 0.8);
  for (const slot of full.order) {
    const a = full.bySlot.get(slot).box;
    const b = narrow.bySlot.get(slot).box;
    // Narrowed about the centre line: each box keeps its distance from it, scaled by the fit.
    assert.ok(Math.abs((b.x + b.w / 2 - WIDTH / 2) - 0.8 * (a.x + a.w / 2 - WIDTH / 2)) < 1e-9);
    assert.ok(Math.abs(b.w - 0.8 * a.w) < 1e-9);
  }
});

test('the band\'s boxes are carried into the board\'s width units, centred on it', () => {
  const band = 393;
  const width = band - 2 * 16;
  const boxes = bandBoxesOnBoard(new Map([['footwear', { x: 0.5, y: 0.25, w: 0.1, h: 0.2 }]]), band, width);
  const box = boxes.get('footwear');
  // The band's centre line is the board's centre line.
  assert.ok(Math.abs(box.x * width - (0.5 * band - (band - width) / 2)) < 1e-9);
  assert.ok(Math.abs(box.w * width - 0.1 * band) < 1e-9);
  assert.ok(Math.abs(box.h * width - 0.2 * band) < 1e-9);
  assert.ok(Math.abs(box.y * width - 0.25 * band) < 1e-9);
});

test('a box lerps corner by corner, and a point on its edge is inside it', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 10, y: 20, w: 30, h: 50 };
  assert.deepEqual(lerpBox(a, b, 0), a);
  assert.deepEqual(lerpBox(a, b, 1), b);
  assert.deepEqual(lerpBox(a, b, 0.5), { x: 5, y: 10, w: 20, h: 30 });
  assert.equal(insideBox(a, 10, 10), true);
  assert.equal(insideBox(a, 10.01, 5), false);
});

test('an enlargement grows within the swap range and holds a stage no candidate outgrows', () => {
  const rest = compose(look, 1);
  const grow = growFor({ pieces: look, slot: 'footwear', order: footwear, current: rest, width: WIDTH, large: false,
    fit: 1 }, compose);
  assert.ok(grow.scale >= SWAP_GROW_MIN && grow.scale <= SWAP_GROW_MAX);
  assert.ok(grow.held >= rest.height);
  for (const candidate of footwear) {
    const pieces = look.map((piece) => (piece.slot === 'footwear' ? { ...piece, ...candidate } : piece));
    assert.ok(grow.held >= compose(pieces, 1).height);
  }
  assert.deepEqual({ slot: grow.slot, width: grow.width, large: grow.large, fit: grow.fit },
    { slot: 'footwear', width: WIDTH, large: false, fit: 1 });
});

test('a short visible height composes the enlarged board narrower until stage and strip fit', () => {
  const rest = compose(look, 1);
  const panel = 44 + 8 + swapStripLayout(footwear.length, footwear.length, WIDTH).height;
  const roomy = enlargementFor({ pieces: look, slot: 'footwear', order: footwear, rest, width: WIDTH, large: false,
    panel, visible: 0, keptHeld: 0 }, compose);
  assert.equal(roomy.fit, 1);
  const visible = roomy.held + panel;
  const fitted = enlargementFor({ pieces: look, slot: 'footwear', order: footwear, rest, width: WIDTH, large: false,
    panel, visible, keptHeld: 0 }, compose);
  assert.ok(fitted.fit < 1);
  assert.ok(Math.abs(fitted.held - roomy.held * fitted.fit) < 1e-9);
  assert.deepEqual({ panel: fitted.panel, visible: fitted.visible }, { panel, visible });
  // A stage held by the enlargement it moved from is never shrunk.
  const kept = enlargementFor({ pieces: look, slot: 'footwear', order: footwear, rest, width: WIDTH, large: false,
    panel, visible: 0, keptHeld: roomy.held + 100 }, compose);
  assert.equal(kept.held, roomy.held + 100);

  const wanted = { slot: 'footwear', width: WIDTH, large: false, panel, visible };
  assert.equal(enlargementHolds(fitted, wanted), true);
  assert.equal(enlargementHolds(fitted, { ...wanted, panel: panel + 1 }), false);
  assert.equal(enlargementHolds(fitted, { ...wanted, slot: 'bottom' }), false);
});

test('the pager pages the grown piece in a window its stepped-back neighbours stay clear of', () => {
  const composed = compose(look, 1);
  const grow = growFor({ pieces: look, slot: 'footwear', order: footwear, current: composed, width: WIDTH,
    large: false, fit: 1 }, compose);
  const neighbours = neighbourBoxes({ pieces: look, composed, slot: 'footwear', garmentTypeId: 'sandals', candidates,
    fit: 1 }, compose);
  assert.ok(neighbours[1] && neighbours[-1]);
  const pager = pagerFor(composed, 'footwear', grow, WIDTH, neighbours, OUTLINE);
  assert.ok(pager.strideNext > 0 && pager.stridePrevious > 0);
  assert.ok(pager.window.x >= 0 && pager.window.x + pager.window.w <= WIDTH + 1e-9);
  assert.ok(insideBox(pager.window, pager.grown.x + pager.grown.w / 2, pager.grown.y + pager.grown.h / 2));
  for (const slot of ['primary_top', 'bottom']) {
    const back = swapScaledBox(composed.bySlot.get(slot).box, SWAP_STEP_BACK);
    assert.equal(insideBox(pager.zone, back.x + back.w / 2, back.y + back.h / 2), false);
  }
  assert.equal(pagerFor(composed, 'outer_layer', grow, WIDTH, neighbours, OUTLINE), null);
});

test('the first and last candidates have no neighbour beyond them', () => {
  const composed = compose(look, 1);
  const first = neighbourBoxes({ pieces: look, composed, slot: 'footwear', garmentTypeId: 'sneakers', candidates,
    fit: 1 }, compose);
  assert.equal(first[-1], null);
  assert.ok(first[1]);
  const last = neighbourBoxes({ pieces: look, composed, slot: 'footwear', garmentTypeId: 'closed_shoes', candidates,
    fit: 1 }, compose);
  assert.equal(last[1], null);
  assert.ok(last[-1]);
  const unknown = neighbourBoxes({ pieces: look, composed, slot: 'footwear', garmentTypeId: undefined, candidates,
    fit: 1 }, compose);
  assert.deepEqual(unknown, { 1: null, [-1]: null });
});
