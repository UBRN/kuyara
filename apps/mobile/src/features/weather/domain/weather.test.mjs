import assert from 'node:assert/strict';
import test from 'node:test';

import { acceptProvidedSnapshot, activeLocationSnapshot, isNormalizedCoordinates, normalizeCoordinates, showsSnapshotForLocation } from './weather.ts';

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

test('the last device snapshot stays shown for the next device cell, never for a manual place', () => {
  const device = { source: 'device', locationKey: 'device:4101:2899', timeZone: 'Europe/Istanbul' };
  const retained = provided({ locationKey: 'device:4101:2898' });
  assert.equal(showsSnapshotForLocation(retained, device), true);
  assert.equal(showsSnapshotForLocation(retained, { ...device, timeZone: 'Europe/London' }), false);
  assert.equal(showsSnapshotForLocation(retained, { ...device, source: 'manual', locationKey: 'manual:sample.ankara' }), false);
  assert.equal(showsSnapshotForLocation(provided(), device), false);
  assert.equal(showsSnapshotForLocation(provided({ locationKey: 'device:4101:2903' }), device), true);
  assert.equal(showsSnapshotForLocation(provided({ locationKey: 'device:4101:2904' }), device), true);
  assert.equal(showsSnapshotForLocation(provided({ locationKey: 'device:4101:2905' }), device), false);
  assert.equal(showsSnapshotForLocation(provided({ locationKey: 'device:4101:2904' }), { ...device, locationKey: 'device:4096:2899' }), true);
  assert.equal(showsSnapshotForLocation(provided({ locationKey: 'device:4201:2899' }), device), false);
  assert.equal(showsSnapshotForLocation(provided({ locationKey: 'device:4101:2999' }), device), false);
  assert.equal(showsSnapshotForLocation(provided({ locationKey: 'device:abc:2898' }), device), false);
  assert.equal(showsSnapshotForLocation(retained, { ...device, locationKey: 'device:oops' }), false);
  assert.equal(showsSnapshotForLocation(retained, null), false);
});

test('coordinates are whole hundredths of a degree inside the globe', () => {
  assert.equal(isNormalizedCoordinates(9000, 18000), true);
  assert.equal(isNormalizedCoordinates(-9000, -18000), true);
  assert.equal(isNormalizedCoordinates(0, 0), true);
  for (const [latitudeE2, longitudeE2] of [[9001, 0], [-9001, 0], [0, 18001], [0, -18001], [1.5, 0], [0, 0.5], [Number.NaN, 0], [0, Infinity]]) {
    assert.equal(isNormalizedCoordinates(latitudeE2, longitudeE2), false, `${latitudeE2},${longitudeE2}`);
  }
});

test('normalizing keeps the degree limits the stored bounds imply', () => {
  assert.deepEqual(normalizeCoordinates(90, 180), { latitudeE2: 9000, longitudeE2: 18000 });
  assert.deepEqual(normalizeCoordinates(-0.001, 0), { latitudeE2: 0, longitudeE2: 0 });
  assert.throws(() => normalizeCoordinates(90.01, 0), { name: 'WeatherValidationError' });
  assert.throws(() => normalizeCoordinates(0, -180.01), { name: 'WeatherValidationError' });
});
