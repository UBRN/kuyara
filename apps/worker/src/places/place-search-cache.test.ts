import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlaceSearchV1Request } from '@kuyara/contracts';
import type { FetchLike } from '../default-fetch.ts';
import type { RateLimiter } from '../json-request.ts';
import { OpenMeteoPlaceProvider } from './open-meteo-place-provider.ts';
import { createPlaceSearchHandler } from './place-search-handler.ts';

const query: PlaceSearchV1Request = { query: 'Ankara', limit: 5, language: 'tr' };
const raw = { results: [{ id: 311046, name: 'İzmir', admin1: 'İzmir', country: 'Türkiye', latitude: 38.41273, longitude: 27.13838, timezone: 'Europe/Istanbul' }] };
const request = (body: unknown) => new Request('https://worker.test/v1/places/search', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1' },
  body: JSON.stringify(body),
});

// A fake `caches.default`, and a context that collects the background writes so a test can
// await them before the next request.
function harness() {
  const entries = new Map<string, Response>();
  const puts: string[] = [];
  const cache = {
    async match(cacheRequest: Request) { return entries.get(cacheRequest.url)?.clone(); },
    async put(cacheRequest: Request, response: Response) {
      puts.push(cacheRequest.url);
      entries.set(cacheRequest.url, response.clone());
    },
  } as unknown as Cache;
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } };
  return { cache, ctx, entries, puts, settle: () => Promise.all(pending) };
}
function searcher(
  fetch: FetchLike,
  fake: ReturnType<typeof harness>,
  rateLimiter: RateLimiter = { limit: async () => ({ success: true }) },
) {
  const handle = createPlaceSearchHandler({
    provider: new OpenMeteoPlaceProvider({ fetch, timeoutMs: 50 }),
    rateLimiter,
    cache: fake.cache,
  });
  return async (body: unknown = query) => {
    const response = await handle(request(body), fake.ctx);
    await fake.settle();
    return response;
  };
}

test('a repeated search is answered from the cache with one upstream call and an identical response', async () => {
  const fake = harness();
  let calls = 0;
  const search = searcher(async () => { calls++; return Response.json(raw); }, fake);
  const miss = await search();
  const hit = await search();
  assert.equal(calls, 1);
  assert.equal(fake.puts.length, 1);
  assert.equal(await miss.clone().text(), await hit.clone().text());
  assert.equal(hit.status, 200);
  for (const response of [miss, hit]) {
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  }
  assert.deepEqual([...hit.headers].sort(), [...miss.headers].sort());
  // Nothing about the caller or the query text reaches the stored key.
  assert.equal(fake.puts[0].includes('Ankara'), false);
  assert.equal(fake.puts[0].includes('192.0.2.1'), false);
  assert.ok(fake.puts[0].startsWith('https://kuyara.internal/v1/places/search/'));
});

test('every input that changes the answer is part of the cache key', async () => {
  const fake = harness();
  let calls = 0;
  const search = searcher(async () => { calls++; return Response.json(raw); }, fake);
  for (const body of [query, { ...query, language: 'en' }, { ...query, limit: 3 }, { ...query, query: 'Konya' }]) await search(body);
  assert.equal(calls, 4);
  assert.equal(new Set(fake.puts).size, 4);
  await search({ ...query, language: 'en' });
  assert.equal(calls, 4);
});

test('errors and rate-limited answers are never cached', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const fake = harness();
  let calls = 0;
  const failing = searcher(async () => { calls++; return new Response('private', { status: 500 }); }, fake);
  assert.equal((await failing()).status, 503);
  assert.equal((await failing()).status, 503);
  assert.equal(calls, 2);
  const limited = searcher(async () => Response.json(raw), fake, { limit: async () => ({ success: false }) });
  assert.equal((await limited()).status, 429);
  assert.equal(fake.puts.length, 0);
});

test('a cache hit still asks the rate limiter and a denied caller gets no cached answer', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const fake = harness();
  let asked = 0;
  let allowed = true;
  const search = searcher(async () => Response.json(raw), fake, { limit: async () => { asked++; return { success: allowed }; } });
  assert.equal((await search()).status, 200);
  assert.equal((await search()).status, 200);
  allowed = false;
  const denied = await search();
  assert.equal(denied.status, 429);
  assert.deepEqual(await denied.json(), { error: { code: 'rate_limited' } });
  assert.equal(asked, 3);
});

test('an empty answer the provider reported as a success is cached, a degraded one is not', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const none = harness();
  let noneCalls = 0;
  const empty = searcher(async () => { noneCalls++; return Response.json({ generationtime_ms: 0.2 }); }, none);
  await empty({ ...query, query: 'Zzzz' });
  await empty({ ...query, query: 'Zzzz' });
  assert.equal(noneCalls, 1);
  // 'Bilecik' has a lowercase i: the typed query answers nothing, then a spelling retry fails.
  const degraded = harness();
  let calls = 0;
  const search = searcher(async () => {
    calls++;
    if (calls === 1) return Response.json({ generationtime_ms: 0.2 });
    throw new Error('upstream down');
  }, degraded);
  const first = await search({ ...query, query: 'Bilecik' });
  assert.equal(first.status, 200);
  // The internal flag never reaches the client.
  assert.deepEqual(await first.json(), { data: { places: [], attribution: ['open-meteo', 'geonames'] } });
  assert.equal(degraded.puts.length, 0);
});

test('an unreadable cache entry is a miss and a failing cache never breaks the request', async () => {
  const fake = harness();
  let calls = 0;
  const search = searcher(async () => { calls++; return Response.json(raw); }, fake);
  await search();
  fake.entries.set(fake.puts[0], new Response('not json'));
  assert.equal((await search()).status, 200);
  assert.equal(calls, 2);
  const broken = createPlaceSearchHandler({
    provider: new OpenMeteoPlaceProvider({ fetch: async () => Response.json(raw) }),
    rateLimiter: { limit: async () => ({ success: true }) },
    cache: { match: async () => { throw new Error('cache down'); }, put: async () => { throw new Error('cache down'); } } as unknown as Cache,
  });
  const response = await broken(request(query), fake.ctx);
  await fake.settle();
  assert.equal(response.status, 200);
});
