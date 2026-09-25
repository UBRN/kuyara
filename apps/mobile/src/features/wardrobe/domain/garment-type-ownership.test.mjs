import assert from 'node:assert/strict';
import test from 'node:test';

import { matchPieceOwnership } from './garment-type-ownership.ts';

function item({ id, entryState = 'owned', garmentTypeId = 'jeans', colorFamily = null }) {
  return { id, entryState, garmentTypeId, colorFamily };
}

test('O7: an owned record in the piece colour family is "I own it"', () => {
  const exact = item({ id: 'exact', colorFamily: 'blue' });
  assert.deepEqual(matchPieceOwnership('jeans', 'blue', [
    item({ id: 'other', colorFamily: 'black' }), exact,
  ]), { kind: 'owned', item: exact });
});

test('O7: owned records of the type, all in another colour family, are "a similar one"', () => {
  const black = item({ id: 'black', colorFamily: 'black' });
  assert.deepEqual(matchPieceOwnership('jeans', 'blue', [black]), { kind: 'similar', item: black });
});

test('a missing colour family on either side matches on type alone', () => {
  const noColour = item({ id: 'plain' });
  assert.deepEqual(matchPieceOwnership('jeans', 'blue', [noColour]), { kind: 'owned', item: noColour });
  const black = item({ id: 'black', colorFamily: 'black' });
  assert.deepEqual(matchPieceOwnership('jeans', null, [black]), { kind: 'owned', item: black });
});

test('owned outranks wanted, wanted outranks nothing, and other types never match', () => {
  const wanted = item({ id: 'wanted', entryState: 'wanted', colorFamily: 'blue' });
  const owned = item({ id: 'owned', colorFamily: 'black' });
  assert.deepEqual(matchPieceOwnership('jeans', 'blue', [wanted, owned]), { kind: 'similar', item: owned });
  assert.deepEqual(matchPieceOwnership('jeans', 'blue', [wanted]), { kind: 'wanted', item: wanted });
  assert.deepEqual(matchPieceOwnership('jeans', 'blue', [item({ id: 'x', garmentTypeId: 'trousers' })]),
    { kind: 'none' });
  assert.deepEqual(matchPieceOwnership('jeans', 'blue', []), { kind: 'none' });
});
