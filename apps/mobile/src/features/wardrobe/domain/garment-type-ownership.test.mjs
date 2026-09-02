import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveGarmentOwnership } from './garment-type-ownership.ts';

function item({
  id,
  entryState,
  garmentTypeId = 't_shirt',
  createdAt = '2026-09-01T10:00:00.000Z',
}) {
  return { id, entryState, garmentTypeId, createdAt };
}

test('returns none when no item matches the garment type', () => {
  assert.deepEqual(
    resolveGarmentOwnership('t_shirt', [
      item({ id: 'other', entryState: 'owned', garmentTypeId: 'shirt' }),
    ]),
    { state: 'none', itemId: null },
  );
});

test('returns the matching owned item', () => {
  assert.deepEqual(
    resolveGarmentOwnership('t_shirt', [item({ id: 'owned', entryState: 'owned' })]),
    { state: 'owned', itemId: 'owned' },
  );
});

test('returns the matching wanted item', () => {
  assert.deepEqual(
    resolveGarmentOwnership('t_shirt', [item({ id: 'wanted', entryState: 'wanted' })]),
    { state: 'wanted', itemId: 'wanted' },
  );
});

test('owned wins over wanted', () => {
  assert.deepEqual(
    resolveGarmentOwnership('t_shirt', [
      item({ id: 'wanted-first', entryState: 'wanted', createdAt: '2026-08-01T10:00:00.000Z' }),
      item({ id: 'owned-later', entryState: 'owned', createdAt: '2026-09-01T10:00:00.000Z' }),
    ]),
    { state: 'owned', itemId: 'owned-later' },
  );
});

test('ignores legacy items without a garment type', () => {
  assert.deepEqual(
    resolveGarmentOwnership('t_shirt', [
      item({ id: 'legacy', entryState: 'owned', garmentTypeId: null }),
    ]),
    { state: 'none', itemId: null },
  );
});

test('deterministically picks the earliest matching item then the lowest id', () => {
  assert.deepEqual(
    resolveGarmentOwnership('t_shirt', [
      item({ id: 'later', entryState: 'wanted', createdAt: '2026-09-02T10:00:00.000Z' }),
      item({ id: 'z-tie', entryState: 'wanted' }),
      item({ id: 'a-tie', entryState: 'wanted' }),
    ]),
    { state: 'wanted', itemId: 'a-tie' },
  );
});
