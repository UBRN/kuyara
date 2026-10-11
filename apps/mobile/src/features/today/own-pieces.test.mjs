import assert from 'node:assert/strict';
import test from 'node:test';

import { garmentNaturalSwatches } from '../../garment-art/garment-palette.ts';
import { ownPiecesFor } from './application/own-pieces.ts';

const item = (id, garmentTypeId, entryState, colorChoice, colorFamily = null) =>
  ({ id, garmentTypeId, entryState, colorChoice, colorFamily });
const candidates = ['polo_shirt', 't_shirt', 'shirt'].map((garmentTypeId) => ({ garmentTypeId, suitable: true }));

// Detail's "Yours": the reader's owned Closet pieces whose type the slot's catalog already
// offers, each in the swatch it paints the board in. Wanted pieces, other slots' types and
// records without a type never show; the catalog's candidates stay as they are.
test('the slot offers the reader\'s owned pieces of its catalog types, each in its board colour', () => {
  const items = [
    item('a', 'polo_shirt', 'owned', { kind: 'option', id: 'charcoal' }, 'gray'),
    item('b', 'shirt', 'owned', { kind: 'option', id: 'blue_stripes' }, 'white'),
    item('c', 't_shirt', 'wanted', { kind: 'option', id: 'navy' }, 'blue'),
    item('d', 'jeans', 'owned', { kind: 'option', id: 'indigo_denim' }, 'blue'),
    item('e', null, 'owned', null, 'red'),
  ];
  assert.deepEqual(ownPiecesFor(items, candidates, garmentNaturalSwatches), [
    { id: 'a', garmentTypeId: 'polo_shirt', category: 'top', swatchId: 'charcoal' },
    { id: 'b', garmentTypeId: 'shirt', category: 'top', swatchId: 'white' },
  ]);
  assert.deepEqual(ownPiecesFor(items, [], garmentNaturalSwatches), []);
});
