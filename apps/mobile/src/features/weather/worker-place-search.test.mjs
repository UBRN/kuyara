import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkerPlaceSearchDataSource, PlaceSearchError } from './data/worker-place-search-data-source.ts';

const query = { query: 'İzmir', limit: 5, language: 'tr' };
const data = { places: [{ id: 'place.311046', displayName: 'İzmir', region: 'Türkiye', latitudeE2: 3841, longitudeE2: 2714, timeZone: 'Europe/Istanbul' }], attribution: ['open-meteo', 'geonames'] };
function source(fetch) { return new WorkerPlaceSearchDataSource({ baseUrl: 'https://worker.test/', fetch, timeoutMs: 5 }); }

test('future picker searches only the Worker and receives validated display names and attribution', async () => {
  let calls = 0;
  const client = source(async (url, init) => {
    calls++;
    assert.equal(url, 'https://worker.test/v1/places/search');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), query);
    return Response.json({ data });
  });
  assert.deepEqual(await client.search(query), data);
  assert.equal(calls, 1);
});
test('search validates input before transport and accepts empty results', async () => {
  let calls = 0;
  const client = source(async () => { calls++; return Response.json({ data: { ...data, places: [] } }); });
  await assert.rejects(() => client.search({ ...query, query: 'a' }), (error) => error.code === 'invalid-input');
  assert.equal(calls, 0);
  assert.deepEqual((await client.search(query)).places, []);
});
test('search sanitizes transport, timeout, rate limit and malformed response failures', async () => {
  for (const [fetch, code] of [
    [async () => { throw new Error('private query'); }, 'unavailable'],
    [async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('private timeout')))), 'unavailable'],
    [async () => Response.json({ error: { code: 'rate_limited' } }, { status: 429 }), 'rate-limited'],
    [async () => Response.json({ error: { code: 'places_unavailable' } }, { status: 503 }), 'unavailable'],
    [async () => Response.json({ error: { message: 'private' } }, { status: 503 }), 'invalid-response'],
    [async () => new Response('not json'), 'invalid-response'],
    [async () => Response.json({ data: { ...data, places: [{ ...data.places[0], latitudeE2: 1.1 }] } }), 'invalid-response'],
    [async () => Response.json({ data: { ...data, places: Array(6).fill(data.places[0]) } }), 'invalid-response'],
  ]) {
    await assert.rejects(() => source(fetch).search(query), (error) => error instanceof PlaceSearchError && error.code === code && !error.message.includes('private'));
  }
});
