import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canChooseComposePiece,
  colorComposeChoice,
  composeCatalog,
  composePins,
  isComposePieceChosen,
  toggleComposeChoice,
} from './application/compose-selection.ts';

const sweater = { slot: 'primary_top', garmentTypeId: 'sweater' };
const skirt = { slot: 'bottom', garmentTypeId: 'skirt' };
const boots = { slot: 'footwear', garmentTypeId: 'ankle_boots' };
const dress = { slot: 'one_piece', garmentTypeId: 'dress' };
const coat = { slot: 'outer_layer', garmentTypeId: 'coat' };

const choose = (...pieces) => pieces.reduce(toggleComposeChoice, []);

test('a tick chooses a piece without a colour and a second tick lets it go', () => {
  const chosen = choose(sweater);
  assert.deepEqual(chosen, [{ ...sweater, colorId: null }]);
  assert.equal(isComposePieceChosen(chosen, sweater), true);
  assert.deepEqual(toggleComposeChoice(chosen, sweater), []);
});

test('one piece to a slot: another piece for a chosen slot takes its place', () => {
  const chosen = choose(sweater, { slot: 'primary_top', garmentTypeId: 'shirt' });
  assert.deepEqual(chosen.map(({ garmentTypeId }) => garmentTypeId), ['shirt']);
});

test('a one-piece and a top or a bottom never stand together: the later tick wins', () => {
  assert.deepEqual(choose(sweater, skirt, dress).map(({ slot }) => slot), ['one_piece']);
  assert.deepEqual(choose(dress, skirt).map(({ slot }) => slot), ['bottom']);
  assert.deepEqual(choose(dress, sweater).map(({ slot }) => slot), ['primary_top']);
  // A layer and the footwear sit beside any body.
  assert.deepEqual(choose(dress, coat, boots).map(({ slot }) => slot), ['one_piece', 'outer_layer', 'footwear']);
});

test('at most three pieces: a fourth tick changes nothing, a replacement still does', () => {
  const three = choose(sweater, skirt, boots);
  assert.equal(canChooseComposePiece(three, coat), false);
  assert.equal(toggleComposeChoice(three, coat), three);
  // A chosen piece can always be let go, and a piece for a chosen slot replaces it.
  assert.equal(canChooseComposePiece(three, sweater), true);
  assert.equal(canChooseComposePiece(three, dress), true);
  assert.deepEqual(toggleComposeChoice(three, dress).map(({ slot }) => slot), ['footwear', 'one_piece']);
});

test('a colour belongs to its piece and goes with it', () => {
  const coloured = colorComposeChoice(choose(sweater, skirt), 'primary_top', 'tomato_red');
  assert.deepEqual(coloured.map(({ colorId }) => colorId), ['tomato_red', null]);
  assert.deepEqual(colorComposeChoice(coloured, 'primary_top', null).map(({ colorId }) => colorId), [null, null]);
  // A colour for a slot nothing is chosen in is ignored.
  assert.equal(colorComposeChoice(coloured, 'footwear', 'black'), coloured);
});

test('the pins carry the board swatch of the Closet colour, and only a known solid paints', () => {
  const chosen = colorComposeChoice(colorComposeChoice(choose(sweater, skirt, boots),
    'primary_top', 'tomato_red'), 'bottom', 'white');
  assert.deepEqual(composePins(chosen), [
    { slot: 'primary_top', garmentTypeId: 'sweater', swatchId: 'tomato' },
    { slot: 'bottom', garmentTypeId: 'skirt', swatchId: 'white' },
    { slot: 'footwear', garmentTypeId: 'ankle_boots' },
  ]);
  assert.deepEqual(composePins(colorComposeChoice(choose(sweater), 'primary_top', 'floral')),
    [{ slot: 'primary_top', garmentTypeId: 'sweater' }]);
});

test('"Choose another piece" lists the catalog by slot for the profile, a mid-layer piece under both its slots', () => {
  const womens = composeCatalog('womens');
  assert.deepEqual(womens.map(({ slot }) => slot),
    ['primary_top', 'bottom', 'one_piece', 'mid_layer', 'outer_layer', 'footwear']);
  const ids = (slot) => womens.find((group) => group.slot === slot).garmentTypeIds;
  assert.ok(ids('primary_top').includes('sweater'));
  assert.ok(ids('mid_layer').includes('sweater'));
  assert.ok(ids('one_piece').includes('dress'));
  assert.ok(!ids('footwear').includes('umbrella'));
  // No catalog one-piece is for men, so the group is absent rather than empty.
  const mens = composeCatalog('mens');
  assert.equal(mens.some(({ slot }) => slot === 'one_piece'), false);
  assert.ok(mens.every(({ garmentTypeIds }) => garmentTypeIds.length > 0));
});
