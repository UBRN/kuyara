import assert from 'node:assert/strict';
import test from 'node:test';

import { composeFlatLay, fitDetailStage, flatLayPreset } from './compose-flat-lay.ts';
import { detailPreset, drawnExtent, placeOnRunway } from './compose-garment-board.ts';
import { resolveGarmentSilhouette } from './garment-silhouette-map.ts';
import {
  SWAP_GROW_MAX,
  SWAP_GROW_MIN,
  SWAP_STEP_BACK,
  swapChevrons,
  swapScaledBox,
  swapStripLayout,
} from './swap-gesture.ts';
import {
  bandBoxesOnBoard,
  enlargedComposition,
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

// The detail board, as `composeDetailBoard` lays it: the flat lay fitted to the column, in
// stage widths.
const composition = (pieces, width = WIDTH) => {
  const result = composeFlatLay(pieces.map((piece) => ({
    ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category, 'womens'),
  })), detailPreset);
  const extent = drawnExtent(result.boxes.values());
  const { scale, height } = fitDetailStage(extent, width, Math.max(...result.core.map((piece) => result.boxes.get(piece).w)));
  const boxes = new Map(result.order.map((piece) => {
    const box = placeOnRunway(result.boxes.get(piece), extent, scale, width, height);
    return [piece, { x: box.x / width, y: box.y / width, w: box.w / width, h: box.h / width }];
  }));
  return { order: result.order, stack: result.stack, boxes, stageHeight: height / width };
};
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
  assert.ok(Math.abs(narrow.height - units.stageHeight * WIDTH * 0.8) < 1e-9);
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
  const enlarged = enlargedComposition(composed, 'footwear', grow, WIDTH);
  const pager = pagerFor(enlarged, 'footwear', grow, WIDTH, neighbours, OUTLINE);
  assert.ok(pager.strideNext > 0 && pager.stridePrevious > 0);
  assert.ok(pager.window.x >= 0 && pager.window.x + pager.window.w <= WIDTH + 1e-9);
  assert.ok(insideBox(pager.window, pager.grown.x + pager.grown.w / 2, pager.grown.y + pager.grown.h / 2));
  for (const slot of ['primary_top', 'bottom']) {
    const back = swapScaledBox(enlarged.bySlot.get(slot).box, SWAP_STEP_BACK);
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

// The detail board lies flat (ADR 0026 section 6): an enlarged piece grows about its centre and
// the others step back to 0.9 beside it, never under it. Each case enlarges one slot of a real
// outfit, with a few of the slot's candidates, on the columns of 375- and 402-point phones.
const apart = (a, b, gap) => a.x >= b.x + b.w + gap || b.x >= a.x + a.w + gap || a.y >= b.y + b.h + gap || b.y >= a.y + a.h + gap;
const of = (slot, garmentTypeId, category) => ({ slot, garmentTypeId, category });
const shirtLook = [of('primary_top', 'shirt', 'top'), of('bottom', 'trousers', 'bottom'), of('footwear', 'loafers', 'footwear')];
const layered = [of('primary_top', 'long_sleeve_t_shirt', 'top'), of('bottom', 'jeans', 'bottom'),
  of('mid_layer', 'sweater', 'top'), of('outer_layer', 'trench_coat', 'outerwear'), of('footwear', 'ankle_boots', 'footwear')];
const dressed = [of('one_piece', 'dress', 'one_piece'), of('outer_layer', 'rain_jacket', 'outerwear'), of('footwear', 'sandals', 'footwear')];
const cases = [
  ['an enlarged top', shirtLook, 'primary_top', [['t_shirt', 'top'], ['shirt', 'top'], ['sweater', 'top'], ['polo_shirt', 'top']], ['bottom']],
  ['an enlarged top between its layers and bottom', layered, 'primary_top', [['long_sleeve_t_shirt', 'top'], ['shirt', 'top'], ['t_shirt', 'top']], ['bottom']],
  ['an enlarged bottom', shirtLook, 'bottom', [['jeans', 'bottom'], ['trousers', 'bottom'], ['skirt', 'bottom'], ['shorts', 'bottom']], []],
  ['an enlarged outer layer', layered, 'outer_layer', [['coat', 'outerwear'], ['trench_coat', 'outerwear'], ['rain_jacket', 'outerwear']], ['primary_top', 'bottom']],
  ['an enlarged one-piece', dressed, 'one_piece', [['dress', 'one_piece'], ['jumpsuit', 'one_piece'], ['knit_dress', 'one_piece']], []],
];
for (const width of [343, 370]) {
  const composeAt = (pieces, fit) => placeComposition(composition(pieces, width), width, fit);
  for (const [name, look, slot, types, toRight] of cases) {
    test(`on a ${width}-point column, ${name} grows in place and the others step back beside it`, () => {
      const order = types.map(([garmentTypeId, category]) => ({ garmentTypeId, category, suitable: true }));
      const rest = composeAt(look, 1);
      const enlargement = enlargementFor({ pieces: look, slot, order, rest, width, large: false, panel: 200, visible: 0,
        keptHeld: 0 }, composeAt);
      assert.ok(enlargement.scale >= SWAP_GROW_MIN && enlargement.scale <= SWAP_GROW_MAX);
      assert.ok(enlargement.fit >= 1 / SWAP_GROW_MIN && enlargement.fit <= 1);
      const composed = enlargement.fit < 1 ? composeAt(look, enlargement.fit) : rest;
      const grow = { ...enlargement, held: Math.max(enlargement.held, composed.height) };
      const shown = enlargedComposition(composed, slot, grow, width);
      const garmentTypeId = look.find((piece) => piece.slot === slot).garmentTypeId;
      const candidates = { [slot]: order };
      const pager = pagerFor(shown, slot, grow, width, neighbourBoxes({ pieces: look, composed: shown, slot, garmentTypeId,
        candidates, fit: enlargement.fit }, composeAt), OUTLINE);
      const { grown, window } = pager;
      // Never drawn under its resting size, and wholly on the held stage.
      assert.ok(grown.w >= rest.bySlot.get(slot).box.w - 1e-9, `${grown.w}`);
      assert.ok(grown.x >= 0 && grown.x + grown.w <= width + 1e-9 && grown.y >= 0 && grown.y + grown.h <= grow.held + 1e-9);
      const side = flatLayPreset.tile.side;
      for (const other of shown.order.filter((entry) => entry !== slot)) {
        const back = swapScaledBox(shown.bySlot.get(other).box, SWAP_STEP_BACK);
        // Clear of the enlarged piece, never under it, and inside the board's margins.
        assert.ok(apart(grown, back, 8 - 1e-9), `${other} under ${slot}`);
        assert.ok(back.x >= side - 1e-9 && back.x + back.w <= width - side + 1e-9, `${other} off the stage`);
        // The paging window never reaches a piece standing wholly to one side.
        if (back.x + back.w <= grown.x || back.x >= grown.x + grown.w) assert.ok(apart(window, back, 0), `${other} in the window`);
        if (toRight.includes(other)) assert.ok(back.x >= grown.x + grown.w, `${other} beside ${slot}`);
      }
      // The 44-point chevrons stand on the stage, each on its side of the enlarged piece, and cover no piece.
      const backs = shown.order.filter((entry) => entry !== slot)
        .map((other) => swapScaledBox(shown.bySlot.get(other).box, SWAP_STEP_BACK));
      {
        const size = 44;
        const chevrons = swapChevrons(grown, backs, width, grow.held, size);
        for (const [side, spot] of Object.entries(chevrons)) {
          const box = { ...spot, w: size, h: size };
          assert.ok(box.x >= 0 && box.x + size <= width + 1e-9 && box.y >= 0 && box.y + size <= grow.held + 1e-9, side);
          for (const piece of [grown, ...backs]) assert.ok(apart(box, piece, 0), `${side} chevron covers a piece`);
        }
        assert.ok(chevrons.previous.x + size / 2 < grown.x + grown.w / 2 && chevrons.next.x + size / 2 > grown.x + grown.w / 2);
      }
    });
  }
}
