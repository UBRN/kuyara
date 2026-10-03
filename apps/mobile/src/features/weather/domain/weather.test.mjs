import assert from 'node:assert/strict';
import test from 'node:test';

import { acceptProvidedSnapshot, activeLocationSnapshot } from './weather.ts';

const location = { locationKey: 'manual:sample.istanbul', timeZone: 'Europe/Istanbul' };
const now = '2026-10-04T10:00:00.000Z';
const provided = (overrides = {}) => ({
  locationKey: location.locationKey,
  timeZone: location.timeZone,
  fetchedAt: '2026-10-04T09:59:00.000Z',
  ...overrides,
});

test('a provided snapshot for the location with a trustworthy fetch time is accepted as is', () => {
  const snapshot = provided();
  assert.equal(acceptProvidedSnapshot(location, snapshot, now), snapshot);
});

test('a skewed fetch time inside the tolerance is accepted, one beyond it is refused', () => {
  assert.doesNotThrow(() => acceptProvidedSnapshot(location, provided({ fetchedAt: '2026-10-04T10:04:00.000Z' }), now));
  assert.throws(
    () => acceptProvidedSnapshot(location, provided({ fetchedAt: '2026-10-04T10:06:00.000Z' }), now),
    { message: 'Invalid weather fetch time.' },
  );
  assert.throws(
    () => acceptProvidedSnapshot(location, provided({ fetchedAt: 'not a time' }), now),
    { message: 'Invalid weather fetch time.' },
  );
});

test('a snapshot for another place or zone is refused', () => {
  assert.throws(
    () => acceptProvidedSnapshot(location, provided({ locationKey: 'manual:sample.ankara' }), now),
    { message: 'Mismatched weather location.' },
  );
  assert.throws(
    () => acceptProvidedSnapshot(location, provided({ timeZone: 'UTC' }), now),
    { message: 'Mismatched weather location.' },
  );
});

test('a snapshot belongs to the active place only by its location key', () => {
  const snapshot = provided();
  assert.equal(activeLocationSnapshot(snapshot, location), snapshot);
  assert.equal(activeLocationSnapshot(snapshot, { ...location, locationKey: 'manual:sample.ankara' }), null);
  assert.equal(activeLocationSnapshot(snapshot, null), null);
  assert.equal(activeLocationSnapshot(null, location), null);
});
