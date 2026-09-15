import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenMeteoPlaceProvider, PlaceSearchProviderError } from './open-meteo-place-provider.ts';

const query = { query: 'İzmir', limit: 5, language: 'tr' };
const place = (id, name, latitude) => ({ id, name, admin1: name, country: 'Türkiye', latitude, longitude: 27.13838, timezone: 'Europe/Istanbul' });
const provider = (body) => new OpenMeteoPlaceProvider({ fetch: async () => Response.json(body), timeoutMs: 50 });
// Keep the dropped-entry warning out of the test output and return what it was called with.
async function withWarnings(run) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(...args);
  try {
    return { result: await run(), warnings };
  } finally {
    console.warn = original;
  }
}

test('one malformed entry is dropped and the valid ones stay in upstream order', async () => {
  const body = {
    results: [
      place(1, 'Aydın', 37.84),
      { ...place(2, 'Bozuk', 38.41), latitude: 91 },
      place(3, 'Manisa', 38.61),
      { name: 'Eksik' },
      place(4, 'Muğla', 37.21),
    ],
  };
  const { result, warnings } = await withWarnings(() => provider(body).search(query));
  assert.deepEqual(result.places.map((entry) => entry.id), ['place.1', 'place.3', 'place.4']);
  assert.deepEqual(result.attribution, ['open-meteo', 'geonames']);
  assert.deepEqual(warnings, [{ event: 'place_result_dropped', dropped: 2, kept: 3 }]);
});

test('a response whose entries are all unreadable fails as an invalid provider response', async () => {
  const body = { results: [{ ...place(1, 'Bozuk', 38.41), latitude: 91 }, { name: 'Eksik' }] };
  const { warnings } = await withWarnings(async () => {
    await assert.rejects(
      () => provider(body).search(query),
      (error) => error instanceof PlaceSearchProviderError && error.message === 'Place search is unavailable.',
    );
  });
  assert.deepEqual(warnings, [{ event: 'place_result_dropped', dropped: 2, kept: 0 }]);
});

test('an absent or empty results list is still a valid no-hit answer', async () => {
  for (const body of [{ results: [] }, { generationtime_ms: 0.2 }]) {
    const { result, warnings } = await withWarnings(() => provider(body).search(query));
    assert.deepEqual(result.places, []);
    assert.deepEqual(warnings, []);
  }
  await assert.rejects(() => provider({ error: true }).search(query), PlaceSearchProviderError);
});

test('a fully valid response is mapped unchanged and an over-long one is still rejected', async () => {
  const { result, warnings } = await withWarnings(() => provider({ results: [place(311046, 'İzmir', 38.41273)] }).search(query));
  assert.deepEqual(result.places, [{
    id: 'place.311046', displayName: 'İzmir', region: 'İzmir, Türkiye',
    latitudeE2: 3841, longitudeE2: 2714, timeZone: 'Europe/Istanbul',
  }]);
  assert.deepEqual(warnings, []);
  await assert.rejects(() => provider({ results: Array(6).fill(place(1, 'İzmir', 38.41)) }).search(query), PlaceSearchProviderError);
});
