import assert from 'node:assert/strict';
import test from 'node:test';

import { composeGarmentBoard, detailPreset } from './compose-garment-board.ts';
import { resolveGarmentSilhouette } from './garment-silhouette-map.ts';
import { drawingKey, emptyModel, reconcile } from './swap-reconcile.ts';

const WIDTH = 358;

// A plain stand-in for a shared value: reconcile only allocates them.
const mutable = (value) => ({ value, get() { return this.value; }, set(next) { this.value = next; } });
const values = (start) => ({
  from: mutable(start.from), to: mutable(start.box), p: mutable(start.p), dx: mutable(start.dx), op: mutable(start.op),
  sc: mutable(start.sc), dy: mutable(0), drain: mutable(0), hand: mutable(start.hand), handFrom: mutable(1),
  handTo: mutable(Number.NaN),
});
const compose = (pieces, fit = 1) => {
  const result = composeGarmentBoard(pieces.map((piece) => ({
    ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category, 'womens'),
  })), detailPreset);
  const size = WIDTH * fit;
  const left = (WIDTH - size) / 2;
  const bySlot = new Map(result.order.map((piece) => {
    const box = result.boxes.get(piece);
    return [piece.slot, { piece, box: { x: left + box.x * size, y: box.y * size, w: box.w * size, h: box.h * size } }];
  }));
  return { bySlot, order: result.order.map(({ slot }) => slot), height: result.stageHeight * size };
};
const tools = {
  values,
  compose,
  entranceBoxes: (pieces) => new Map([...compose(pieces).bySlot].map(([slot, { box }]) => [
    slot, { x: box.x / WIDTH, y: box.y / WIDTH, w: box.w / WIDTH, h: box.h / WIDTH },
  ])),
};

const shoes = ['sneakers', 'sandals', 'closed_shoes'];
const candidates = {
  footwear: shoes.map((garmentTypeId) => ({ garmentTypeId, category: 'footwear', suitable: true })),
};
const piecesWith = (footwear) => [
  { slot: 'one_piece', garmentTypeId: 'dress', category: 'one_piece' },
  { slot: 'footwear', garmentTypeId: footwear, category: 'footwear' },
];
const paletteOf = (pieces) => ({
  optionId: 'outfit-a', formality: 'casual', temperatureC: 24, condition: 'clear', isNight: false,
  pieces: pieces.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })),
});
// Colour roles are opaque to reconcile; one per garment keeps a promoted neighbour's own.
const rolesFor = (palette) => new Map(palette.pieces.map(({ slot, garmentTypeId }) => [slot, { fill: garmentTypeId }]));
const grow = { slot: 'footwear', scale: 1.6, held: 420, width: WIDTH, large: false, fit: 1 };
const pager = {
  grown: { x: 100, y: 200, w: 160, h: 120 }, window: { x: 40, y: 180, w: 280, h: 180 },
  strideNext: 240, stridePrevious: 230, zone: { x: 60, y: 180, w: 240, h: 180 },
};

let step = 0;
function next(model, footwear, focusedSlot) {
  const pieces = piecesWith(footwear);
  const palette = paletteOf(pieces);
  step += 1;
  return reconcile(model, {
    signature: `step-${step}`, composed: compose(pieces), pieces, palette, roles: rolesFor(palette), rolesFor,
    width: WIDTH, focusedSlot, grow: focusedSlot ? grow : null, pager: focusedSlot ? pager : null, candidates,
  }, tools);
}
const instance = (model, garmentTypeId) => model.instances.find((one) => one.garmentTypeId === garmentTypeId);
const intentsFor = (model, garmentTypeId) => {
  const target = instance(model, garmentTypeId)?.values;
  return model.intents.filter((intent) => intent.values === target).map(({ kind }) => kind);
};
function enlarged(footwear = 'sandals') {
  return next(next(emptyModel, footwear, null), footwear, 'footwear');
}

test('enlarging a piece grows it and sets both neighbours waiting behind the window', () => {
  const model = enlarged();
  assert.deepEqual(intentsFor(model, 'sandals'), ['scale']);
  assert.equal(instance(model, 'sneakers').role, 'previous');
  assert.equal(instance(model, 'closed_shoes').role, 'next');
  assert.equal(instance(model, 'sneakers').values.dx.get(), -pager.stridePrevious);
  assert.equal(instance(model, 'closed_shoes').values.dx.get(), pager.strideNext);
});

test('after a swiped step the old piece becomes the neighbour: no exit spring, a wait', () => {
  const model = enlarged();
  const committed = next({ ...model, gestureCommit: { slot: 'footwear', garmentTypeId: 'closed_shoes' } },
    'closed_shoes', 'footwear');
  const promote = committed.intents.find((intent) => intent.kind === 'promote');
  assert.equal(promote.values, instance(model, 'closed_shoes').values);
  assert.equal(promote.fromGesture, true);
  const leave = committed.intents.find((intent) => intent.kind === 'leave');
  assert.equal(leave.fromGesture, true);
  assert.equal(committed.intents.some((intent) => intent.kind === 'enter'), false);
  // The piece swiped away is closed shoes' previous neighbour: it waits, it is not recreated.
  const old = instance(committed, 'sandals');
  assert.equal(old.role, 'previous');
  assert.equal(old.values, instance(model, 'sandals').values);
  const wait = committed.intents.find((intent) => intent.kind === 'wait' && intent.values === old.values);
  assert.equal(wait.created, false);
  assert.equal(wait.offset, -pager.stridePrevious);
  // Sneakers are no longer a neighbour and retire to where they waited.
  const retire = committed.intents.find((intent) => intent.kind === 'retire');
  assert.equal(retire.key, 'footwear|sneakers');
  assert.equal(retire.offset, -pager.stridePrevious);
  assert.equal(committed.gestureCommit, null);
});

test('settling retires both neighbours to where they wait', () => {
  const settled = next(enlarged(), 'sandals', null);
  const retired = settled.intents.filter((intent) => intent.kind === 'retire');
  assert.deepEqual(retired.map(({ key, offset }) => [key, offset]).sort(), [
    ['footwear|closed_shoes', pager.strideNext],
    ['footwear|sneakers', -pager.stridePrevious],
  ]);
  assert.ok(settled.instances.filter(({ slot }) => slot === 'footwear')
    .every(({ role, garmentTypeId }) => (garmentTypeId === 'sandals' ? role === 'current' : role === 'leaving')));
});

test('a tile tap enters from the side of the strip it lies on', () => {
  const enlargedFirst = enlarged('sneakers');
  const later = next(enlargedFirst, 'closed_shoes', 'footwear');
  const forward = later.intents.find((intent) => intent.kind === 'enter');
  assert.equal(forward.direction, 1);
  assert.equal(forward.paged, true);
  assert.equal(forward.stride, pager.strideNext);
  // Unseen until its offset behind the window's edge is set with it.
  assert.equal(forward.values.op.get(), 0);
  const earlier = next(enlarged('closed_shoes'), 'sneakers', 'footwear');
  const back = earlier.intents.find((intent) => intent.kind === 'enter');
  assert.equal(back.direction, -1);
  assert.equal(back.stride, pager.stridePrevious);
});

test('a step at rest crossfades in beside the piece it replaces', () => {
  const rest = next(emptyModel, 'sandals', null);
  const stepped = next(rest, 'closed_shoes', null);
  const enter = stepped.intents.find((intent) => intent.kind === 'enter');
  assert.equal(enter.paged, false);
  assert.equal(enter.direction, 1);
  assert.equal(enter.values.op.get(), 0);
  assert.equal(stepped.intents.find((intent) => intent.kind === 'leave').paged, false);
});

// A drag the focus change cancelled leaves the piece off-centre; its slot's piece comes home.
test('focus leaving a slot springs that slot\'s piece home', () => {
  const model = enlarged();
  const settled = next(model, 'sandals', null);
  const home = settled.intents.filter((intent) => intent.kind === 'home');
  assert.equal(home.length, 1);
  assert.equal(home[0].values, instance(model, 'sandals').values);

  const moved = next(model, 'sandals', 'one_piece');
  assert.deepEqual(moved.intents.filter((intent) => intent.kind === 'home').map(({ values: v }) => v),
    [instance(model, 'sandals').values]);
});

test('a piece already entering or staying enlarged is not sent home', () => {
  assert.equal(enlarged().intents.some((intent) => intent.kind === 'home'), false);
  const model = enlarged();
  const stepped = next(model, 'closed_shoes', 'footwear');
  assert.equal(stepped.intents.some((intent) => intent.kind === 'home'), false);
  // A tile tap and Done in one change: the entering piece's own spring already takes it home.
  const tappedAndDone = next(model, 'closed_shoes', null);
  assert.equal(tappedAndDone.intents.some((intent) => intent.kind === 'home'), false);
});

// A re-laid-out piece's new size reaches the screen a frame before its motion does, so a piece
// kept under one view showed for a frame at its new size (the lower pieces after a far tile, the
// paged piece before them). A piece drawn at a new size gets a fresh view; a move alone, which
// lives only in the transform, keeps the view and its drawing.
test('a piece drawn at a new size gets a fresh view; one that only moves keeps its view', () => {
  let model = next(emptyModel, 'sandals', null);
  let moved = 0;
  const steps = [
    ['sandals', 'footwear'], ['sneakers', 'footwear'], ['closed_shoes', 'footwear'], ['closed_shoes', null],
    ['sneakers', null], ['sandals', 'footwear'], ['sandals', null],
  ];
  for (const [footwear, focus] of steps) {
    const before = new Map(model.instances.map((one) => [one.key, one]));
    model = next(model, footwear, focus);
    for (const after of model.instances) {
      const was = before.get(after.key);
      if (!was) continue;
      const sameSize = was.base.w.toFixed(2) === after.base.w.toFixed(2)
        && was.base.h.toFixed(2) === after.base.h.toFixed(2);
      if (sameSize && (was.base.x !== after.base.x || was.base.y !== after.base.y)) moved += 1;
      assert.equal(drawingKey(after) === drawingKey(was), sameSize, `${after.key} after ${footwear}`);
    }
  }
  assert.ok(moved > 0, `moved ${moved}`);

  // The recorded far tile: a turtleneck changed for a sleeveless top lays the jeans out larger;
  // changed for a sweater, every piece on the core's scale is redrawn and the boots only move.
  const look = (top) => [
    { slot: 'primary_top', garmentTypeId: top, category: 'top' },
    { slot: 'outer_layer', garmentTypeId: 'parka', category: 'outerwear' },
    { slot: 'bottom', garmentTypeId: 'jeans', category: 'bottom' },
    { slot: 'footwear', garmentTypeId: 'weather_boots', category: 'footwear' },
  ];
  const tops = { primary_top: ['sleeveless_top', 'sweater', 'turtleneck']
    .map((garmentTypeId) => ({ garmentTypeId, category: 'top', suitable: true })) };
  const layout = (current, top) => {
    const pieces = look(top);
    const palette = paletteOf(pieces);
    step += 1;
    return reconcile(current, {
      signature: `look-${step}`, composed: compose(pieces), pieces, palette, roles: rolesFor(palette), rolesFor,
      width: WIDTH, focusedSlot: null, grow: null, pager: null, candidates: tops,
    }, tools);
  };
  const turtleneck = layout(emptyModel, 'turtleneck');
  const sleeveless = layout(turtleneck, 'sleeveless_top');
  const jeans = (current) => current.instances.find(({ slot }) => slot === 'bottom');
  assert.notEqual(jeans(sleeveless).base.h, jeans(turtleneck).base.h);
  assert.notEqual(drawingKey(jeans(sleeveless)), drawingKey(jeans(turtleneck)));
  assert.equal(jeans(sleeveless).values, jeans(turtleneck).values);
  // The boots, sized on the core's width, only move; their size, recomputed through other
  // arithmetic, differs only in noise. The parka stands on the core's scale and is redrawn.
  const sweater = layout(turtleneck, 'sweater');
  const boots = (current) => current.instances.find(({ slot }) => slot === 'footwear');
  assert.notEqual(boots(sweater).base.y, boots(turtleneck).base.y);
  assert.equal(drawingKey(boots(sweater)), drawingKey(boots(turtleneck)));
  const parka = (current) => current.instances.find(({ slot }) => slot === 'outer_layer');
  assert.notEqual(drawingKey(parka(sweater)), drawingKey(parka(turtleneck)));
});

test('a leaving piece chosen again fades back in rather than showing at once', () => {
  const stepped = next(enlarged('sandals'), 'closed_shoes', 'footwear');
  assert.equal(instance(stepped, 'sandals').role, 'previous');
  const leaving = next(enlarged('sneakers'), 'closed_shoes', 'footwear');
  assert.equal(instance(leaving, 'sneakers').role, 'leaving');
  const back = next(leaving, 'sneakers', 'footwear');
  const promote = back.intents.find((intent) => intent.kind === 'promote'
    && intent.values === instance(leaving, 'sneakers').values);
  assert.equal(promote.paged, false);
});

// A layer taken off or added: the slot vanishes from the pieces, or appears in them.
const layered = (outer) => [
  { slot: 'primary_top', garmentTypeId: 'shirt', category: 'top' },
  ...(outer ? [{ slot: 'outer_layer', garmentTypeId: outer, category: 'outerwear' }] : []),
  { slot: 'bottom', garmentTypeId: 'jeans', category: 'bottom' },
  { slot: 'footwear', garmentTypeId: 'sneakers', category: 'footwear' },
];
const outers = { outer_layer: ['light_jacket', 'parka'].map((garmentTypeId) => ({ garmentTypeId, category: 'outerwear', suitable: true })) };
const outerGrow = { ...grow, slot: 'outer_layer' };
function layer(model, outer, focusedSlot) {
  const pieces = layered(outer);
  const palette = paletteOf(pieces);
  step += 1;
  return reconcile(model, {
    signature: `layer-${step}`, composed: compose(pieces), pieces, palette, roles: rolesFor(palette), rolesFor,
    width: WIDTH, focusedSlot, grow: focusedSlot ? outerGrow : null, pager: focusedSlot ? pager : null,
    candidates: outers,
  }, tools);
}

test('a layer taken off lifts away and fades in place: no sideways exit, and the slot is forgotten', () => {
  const worn = layer(emptyModel, 'light_jacket', null);
  const jacket = instance(worn, 'light_jacket');
  const off = layer(worn, null, null);
  assert.equal(instance(off, 'light_jacket').role, 'leaving');
  assert.deepEqual(intentsFor(off, 'light_jacket'), ['vanish']);
  assert.equal(off.intents.find((intent) => intent.kind === 'vanish').key, jacket.key);
  assert.equal(off.garments.outer_layer, undefined);
  assert.equal(off.relayouting, true);
  // The pieces that stay glide to their new boxes.
  assert.ok(off.intents.some((intent) => intent.kind === 'retarget'));
});

test('a layer taken off while it is enlarged leaves the same way and is never sent home', () => {
  const enlargedJacket = layer(layer(emptyModel, 'light_jacket', null), 'light_jacket', 'outer_layer');
  assert.equal(instance(enlargedJacket, 'parka').role, 'next');
  // The owner clears the focus in the same render as the removal.
  const off = layer(enlargedJacket, null, null);
  assert.deepEqual(intentsFor(off, 'light_jacket'), ['vanish']);
  assert.equal(off.intents.some((intent) => intent.kind === 'home' || intent.kind === 'leave'), false);
  assert.equal(instance(off, 'parka').role, 'leaving');
  assert.equal(off.focus, null);
});

test('an added layer starts unseen and is hung on', () => {
  const bare = layer(emptyModel, null, null);
  const added = layer(bare, 'parka', null);
  const parka = instance(added, 'parka');
  assert.equal(parka.role, 'current');
  assert.deepEqual(intentsFor(added, 'parka'), ['enter']);
  assert.equal(parka.values.op.get(), 0);
  assert.equal(parka.values.p.get(), 1);
  assert.equal(added.garments.outer_layer, 'parka');
});

test('a layer taken off and put back fades back in rather than showing at once', () => {
  const off = layer(layer(emptyModel, 'light_jacket', null), null, null);
  const back = layer(off, 'light_jacket', null);
  const promote = back.intents.find((intent) => intent.kind === 'promote');
  assert.equal(promote.values, instance(off, 'light_jacket').values);
  assert.equal(promote.paged, false);
});
