import assert from 'node:assert/strict';
import test from 'node:test';

import { composeGarmentBoard, detailPreset } from './compose-garment-board.ts';
import { resolveGarmentSilhouette } from './garment-silhouette-map.ts';
import { emptyModel, reconcile } from './swap-reconcile.ts';

const WIDTH = 358;

// A plain stand-in for a shared value: reconcile only allocates them.
const mutable = (value) => ({ value, get() { return this.value; }, set(next) { this.value = next; } });
const values = (start) => ({
  from: mutable(start.from), to: mutable(start.box), p: mutable(start.p), dx: mutable(start.dx), op: mutable(start.op),
  sc: mutable(start.sc), drain: mutable(0), hand: mutable(start.hand), handFrom: mutable(1), handTo: mutable(Number.NaN),
});
const compose = (pieces, fit = 1) => {
  const result = composeGarmentBoard(pieces.map((piece) => ({
    ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category),
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
