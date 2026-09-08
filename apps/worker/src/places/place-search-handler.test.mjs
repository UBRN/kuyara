import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../index.ts';
import { OpenMeteoPlaceProvider, PlaceSearchProviderError } from './open-meteo-place-provider.ts';
import { createPlaceSearchHandler } from './place-search-handler.ts';

const query = { query: 'İzmir', limit: 5, language: 'tr' };
const raw = { results: [{ id: 311046, name: 'İzmir', admin1: 'İzmir', country: 'Türkiye', latitude: 38.41273, longitude: 27.13838, timezone: 'Europe/Istanbul', population: 2500603 }] };
const request = (body = query, path = '/v1/places/search', method = 'POST') => new Request(`https://worker.test${path}`, {
  method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1' },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});
function setup(fetch, rateLimiter = { limit: async () => ({ success: true }) }) {
  return createPlaceSearchHandler({ provider: new OpenMeteoPlaceProvider({ fetch, timeoutMs: 5 }), rateLimiter });
}

test('search maps upstream fields, coarse coordinates and attribution with one bounded call', async () => {
  let calls = 0;
  const handle = setup(async (url, init) => {
    calls++;
    assert.equal(url.origin, 'https://geocoding-api.open-meteo.com');
    assert.deepEqual(Object.fromEntries(url.searchParams), { name: 'İzmir', count: '5', language: 'tr', format: 'json' });
    assert.equal(init.redirect, 'error');
    return Response.json(raw);
  }, { limit: async ({ key }) => { assert.equal(key, 'weather:192.0.2.1'); return { success: true }; } });
  const result = await handle(request());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await result.json(), { data: { places: [{ id: 'place.311046', displayName: 'İzmir', region: 'İzmir, Türkiye', latitudeE2: 3841, longitudeE2: 2714, timeZone: 'Europe/Istanbul' }], attribution: ['open-meteo', 'geonames'] } });
  assert.equal(calls, 1);
});
test('search accepts empty results and maps a missing time zone without inventing one', async () => {
  for (const body of [{ results: [] }, { generationtime_ms: 0.2 }]) {
    assert.deepEqual((await (await setup(async () => Response.json(body))(request())).json()).data.places, []);
  }
  const { timezone, ...place } = raw.results[0];
  const body = await (await setup(async () => Response.json({ results: [place] }))(request())).json();
  assert.equal(body.data.places[0].timeZone, null);
});
test('timeout aborts the upstream and returns only a sanitized error', async () => {
  let calls = 0;
  const handle = setup(async (_url, { signal }) => {
    calls++;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('private query and coordinates'))));
  });
  const response = await handle(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'places_unavailable' } });
  assert.equal(calls, 1);
});
test('invalid upstream payloads and upstream HTTP errors are sanitized', async () => {
  for (const body of [{ error: true, reason: 'private' }, { results: [{ ...raw.results[0], latitude: 91 }] }, { results: [{ ...raw.results[0], timezone: 'invalid' }] }, { results: Array(6).fill(raw.results[0]) }]) {
    const response = await setup(async () => Response.json(body))(request());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: 'places_unavailable' } });
  }
  for (const status of [429, 500]) {
    const provider = new OpenMeteoPlaceProvider({ fetch: async () => new Response('private', { status }) });
    await assert.rejects(() => provider.search(query), (error) => error instanceof PlaceSearchProviderError && !error.message.includes('private'));
  }
  const response = await setup(async () => new Response('not json'))(request());
  assert.equal(response.status, 503);
});
test('rate limits and limiter outages stop upstream calls', async () => {
  for (const limit of [async () => ({ success: false }), async () => { throw new Error('private'); }]) {
    let calls = 0;
    const response = await setup(async () => { calls++; return Response.json(raw); }, { limit })(request());
    assert.ok([429, 503].includes(response.status));
    if (response.status === 429) assert.equal(response.headers.get('retry-after'), '60');
    assert.equal(calls, 0);
  }
});
test('invalid requests and wrong routes or methods never call upstream', async () => {
  let calls = 0;
  const handle = setup(async () => { calls++; return Response.json(raw); });
  for (const body of [{ ...query, query: 'a' }, { ...query, limit: 6 }, { ...query, language: 'de' }]) assert.equal((await handle(request(body))).status, 400);
  assert.equal((await handle(request(query, '/wrong'))).status, 404);
  const wrongMethod = await handle(request(query, '/v1/places/search', 'GET'));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
  assert.equal((await handle(new Request('https://worker.test/v1/places/search', { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } }))).status, 400);
  assert.equal((await handle(new Request('https://worker.test/v1/places/search', { method: 'POST', body: '{}' }))).status, 400);
  assert.equal(calls, 0);
});
test('production composition routes place search and fails closed without a limiter', async () => {
  assert.equal((await worker.fetch(request(), {})).status, 429);
  assert.equal((await worker.fetch(request(query, '/v1/places/search', 'GET'), {})).status, 405);
});
