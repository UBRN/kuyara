import assert from 'node:assert/strict';
import test from 'node:test';

import { PlaceSearchController } from './application/place-search-controller.ts';
import { PlaceSearchError } from './data/worker-place-search-data-source.ts';

const place = { id: 'place.745044', displayName: 'İstanbul', region: 'Türkiye', latitudeE2: 4101, longitudeE2: 2898, timeZone: 'Europe/Istanbul' };
const data = (places = [place]) => ({ places, attribution: ['open-meteo', 'geonames'] });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('search trims and debounces, sending locale and five results only above the threshold', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const controller = new PlaceSearchController(async (input) => { calls.push(input); return data(); });
  controller.search(' I ', 'en');
  t.mock.timers.tick(300);
  assert.equal(calls.length, 0);
  controller.search(' Is ', 'en');
  t.mock.timers.tick(299);
  assert.equal(calls.length, 0);
  controller.search(' Ista ', 'tr');
  t.mock.timers.tick(300);
  await flush();
  assert.deepEqual(calls, [{ query: 'Ista', language: 'tr', limit: 5 }]);
  assert.deepEqual(controller.getSnapshot(), { status: 'ready', places: [place] });
  controller.search('x'.repeat(101), 'en');
  t.mock.timers.tick(300);
  assert.equal(calls.length, 1);
  assert.deepEqual(controller.getSnapshot(), { status: 'error', code: 'invalid-input' });
});

test('late results and errors cannot replace a newer search, a cleared query or a closed picker', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = [];
  const controller = new PlaceSearchController(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  controller.search('Ista', 'tr'); t.mock.timers.tick(300);
  controller.search('London', 'en'); t.mock.timers.tick(300);
  pending[1].resolve(data([])); await flush();
  pending[0].reject(new PlaceSearchError('unavailable')); await flush();
  assert.deepEqual(controller.getSnapshot(), { status: 'ready', places: [] });
  controller.search('Ista', 'en'); t.mock.timers.tick(300);
  controller.search('', 'en');
  pending[2].resolve(data()); await flush();
  assert.deepEqual(controller.getSnapshot(), { status: 'idle' });
  controller.search('London', 'en'); t.mock.timers.tick(300);
  controller.cancel();
  const stopped = controller.getSnapshot();
  pending[3].resolve(data()); await flush();
  assert.equal(controller.getSnapshot(), stopped);
});

test('search drops places without a time zone and exposes only safe error codes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new PlaceSearchController(async () => data([{ ...place, timeZone: null }]));
  controller.search('Ista', 'en'); t.mock.timers.tick(300); await flush();
  assert.deepEqual(controller.getSnapshot(), { status: 'ready', places: [] });
  for (const code of ['invalid-input', 'invalid-response', 'unavailable', 'rate-limited']) {
    const failing = new PlaceSearchController(async () => { throw new PlaceSearchError(code); });
    failing.search('Ista', 'en'); t.mock.timers.tick(300); await flush();
    assert.deepEqual(failing.getSnapshot(), { status: 'error', code });
  }
  const failing = new PlaceSearchController(async () => { throw new Error('private URL'); });
  failing.search('Ista', 'en'); t.mock.timers.tick(300); await flush();
  assert.deepEqual(failing.getSnapshot(), { status: 'error', code: 'unavailable' });
});
