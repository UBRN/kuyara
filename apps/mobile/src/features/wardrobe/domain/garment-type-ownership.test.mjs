import assert from 'node:assert/strict';
import test from 'node:test';

import { closetWearCounts, matchPieceOwnership } from './garment-type-ownership.ts';

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

test('a worn day counts once for the one owned record of each type it wore', () => {
  const jeans = item({ id: 'jeans', colorFamily: 'blue' });
  const tee = item({ id: 'tee', garmentTypeId: 't_shirt' });
  const counts = closetWearCounts([jeans, tee], [
    ['t_shirt', 'jeans', 'sneakers'],
    ['t_shirt', 'trousers', 'sneakers'],
    ['jeans', 'jeans'],
  ]);
  assert.deepEqual([...counts].sort(), [['jeans', 2], ['tee', 2]]);
});

test('two owned records of one type are never counted, and wanted records never are', () => {
  const counts = closetWearCounts([
    item({ id: 'blue', colorFamily: 'blue' }),
    item({ id: 'black', colorFamily: 'black' }),
    item({ id: 'wanted-tee', garmentTypeId: 't_shirt', entryState: 'wanted' }),
  ], [['jeans', 't_shirt', 'sneakers']]);
  assert.equal(counts.size, 0);
});

test('a year of worn days is counted in one pass', () => {
  const owned = Array.from({ length: 60 }, (_, index) => item({ id: `item-${index}`, garmentTypeId: `type_${index}` }));
  const days = Array.from({ length: 365 }, (_, index) => ['type_0', `type_${index % 60}`, 'sneakers']);
  const started = performance.now();
  const counts = closetWearCounts(owned, days);
  assert.ok(performance.now() - started < 50);
  assert.equal(counts.get('item-0'), 365);
  assert.equal(counts.get('item-1'), 7);
});
