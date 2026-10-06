import assert from 'node:assert/strict';
import test from 'node:test';
import type { PlaceSearchV1Request } from '@kuyara/contracts';
import type { FetchLike } from '../default-fetch.ts';
import { OpenMeteoPlaceProvider, PlaceSearchProviderError, dotlessSpellings } from './open-meteo-place-provider.ts';

const query: PlaceSearchV1Request = { query: 'Ankara', limit: 5, language: 'tr' };
const place = (id: number, name: string, latitude: number) => ({ id, name, admin1: name, country: 'Türkiye', latitude, longitude: 27.13838, timezone: 'Europe/Istanbul' });
const provider = (body: unknown) => new OpenMeteoPlaceProvider({ fetch: async () => Response.json(body), timeoutMs: 50 });
// Keep the dropped-entry warning out of the test output and return what it was called with.
async function withWarnings<T>(run: () => Promise<T>) {
  const original = console.warn;
  const warnings: unknown[] = [];
  console.warn = (...args: unknown[]) => warnings.push(...args);
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

test('dotless spellings substitute only lowercase i, one position at a time, then all, capped at three', () => {
  assert.deepEqual(dotlessSpellings('Kadikoy'), ['Kadıkoy']);
  assert.deepEqual(dotlessSpellings('Diyarbakir'), ['Dıyarbakir', 'Diyarbakır', 'Dıyarbakır']);
  assert.deepEqual(dotlessSpellings('Kirikkale'), ['Kırikkale', 'Kirıkkale', 'Kırıkkale']);
  assert.equal(dotlessSpellings('Bilecik Osmaneli').length, 3);
  // Open-Meteo already folds uppercase I ("ISTANBUL", "IZMIR" resolve), a query that already
  // carries an ı was typed on a Turkish keyboard, and a query without i has nothing to retry.
  assert.deepEqual(dotlessSpellings('ISTANBUL'), []);
  assert.deepEqual(dotlessSpellings('Kadıköy'), []);
  assert.deepEqual(dotlessSpellings('London'), []);
});

// A fetch stub that answers by the `name` it was asked for and records every call.
function spellingProvider(answers: Record<string, unknown[]>, { throwOn }: { throwOn?: string } = {}) {
  const calls: { name: string; signal: AbortSignal | null | undefined }[] = [];
  const fetch: FetchLike = async (url, init) => {
    // The provider always sends `name`, so the lookup is never null.
    const name = new URL(String(url)).searchParams.get('name') as string;
    calls.push({ name, signal: init?.signal });
    if (name === throwOn) throw new Error('upstream');
    return Response.json({ results: answers[name] ?? [] });
  };
  return { calls, provider: new OpenMeteoPlaceProvider({ fetch, timeoutMs: 50 }) };
}
const ascii: PlaceSearchV1Request = { query: 'Bagcilar', limit: 2, language: 'en' };

test('an empty typed answer triggers exactly one extra call when the first spelling fills the limit', async () => {
  const { calls, provider } = spellingProvider({ Bagcılar: [place(1, 'Bağcılar', 41.03), place(2, 'Bağcılar', 37.7), place(3, 'Bağcılar', 38.1)] });
  const result = await provider.search(ascii);
  assert.deepEqual(calls.map((call) => call.name), ['Bagcilar', 'Bagcılar']);
  assert.equal(calls[1].signal, calls[0].signal);
  assert.deepEqual(result.places.map((entry) => entry.id), ['place.1', 'place.2']);
});

test('a full typed answer triggers no spelling retry', async () => {
  const { calls, provider } = spellingProvider({ Bagcilar: [place(1, 'A', 41), place(2, 'B', 40)] });
  const result = await provider.search(ascii);
  assert.deepEqual(calls.map((call) => call.name), ['Bagcilar']);
  assert.deepEqual(result.places.map((entry) => entry.id), ['place.1', 'place.2']);
});

test('spelling retries append unseen ids after the typed answer, in order, and stop at the limit', async () => {
  const { calls, provider } = spellingProvider(
    { Diyarbakir: [place(9, 'Airport', 37.9)], Dıyarbakir: [place(9, 'Airport', 37.9)], Diyarbakır: [place(5, 'Diyarbakır', 37.91), place(6, 'Other', 38)] },
  );
  const result = await provider.search({ query: 'Diyarbakir', limit: 2, language: 'en' });
  assert.deepEqual(calls.map((call) => call.name), ['Diyarbakir', 'Dıyarbakir', 'Diyarbakır']);
  assert.deepEqual(result.places.map((entry) => entry.id), ['place.9', 'place.5']);
});

test('a spelling retry that throws still returns the typed answer', async () => {
  const { calls, provider } = spellingProvider({ Diyarbakir: [place(9, 'Airport', 37.9)] }, { throwOn: 'Dıyarbakir' });
  const result = await provider.search({ query: 'Diyarbakir', limit: 5, language: 'en' });
  assert.deepEqual(calls.map((call) => call.name), ['Diyarbakir', 'Dıyarbakir']);
  assert.deepEqual(result.places.map((entry) => entry.id), ['place.9']);
});

test('a typed query that fails still fails, whatever a spelling would have answered', async () => {
  const { calls, provider } = spellingProvider({ Bagcılar: [place(1, 'Bağcılar', 41.03)] }, { throwOn: 'Bagcilar' });
  await assert.rejects(() => provider.search(ascii), PlaceSearchProviderError);
  assert.deepEqual(calls.map((call) => call.name), ['Bagcilar']);
});

test('rows that share a name, province and country carry the district, and no other row does', async () => {
  const merkez = (id: number, admin2: string, latitude: number) => ({
    id, name: 'Merkez', admin1: 'Mersin', admin2, country: 'Türkiye Cumhuriyeti', latitude, longitude: 34.15,
    timezone: 'Europe/Istanbul',
  });
  const body = {
    results: [
      merkez(388147, 'Erdemli İlçesi', 36.48),
      merkez(12556624, 'Aydıncık İlçesi', 36.14),
      { ...place(3, 'Mersin', 36.8), admin2: 'Akdeniz' },
    ],
  };
  const { places } = await provider(body).search({ query: 'Merkez', limit: 5, language: 'tr' });
  assert.deepEqual(places.map((entry) => entry.region), [
    'Erdemli İlçesi, Mersin, Türkiye Cumhuriyeti',
    'Aydıncık İlçesi, Mersin, Türkiye Cumhuriyeti',
    'Mersin, Türkiye',
  ]);
});

test('a malformed district never hides the place', async () => {
  for (const admin2 of ['', '   ', 'x'.repeat(300)]) {
    const { places } = await provider({ results: [{ ...place(1, 'Aydın', 37.84), admin2 }] }).search(query);
    assert.deepEqual(places.map((entry) => [entry.id, entry.region]), [['place.1', 'Aydın, Türkiye']]);
  }
});

test('a district that would push the region past the contract limit is left out instead of failing the answer', async () => {
  // Twin rows make the district part of the label; admin1 plus country leave 399 - 3 characters of room.
  const long = (id: number, admin2: string) => ({
    id, name: 'Merkez', admin1: 'a'.repeat(200), admin2, country: 'c'.repeat(190), latitude: 37, longitude: 27,
  });
  const body = { results: [long(1, 'd'.repeat(200)), long(2, 'e'.repeat(200))] };
  const { places } = await provider(body).search({ query: 'Merkez', limit: 5, language: 'tr' });
  assert.equal(places.length, 2);
  for (const entry of places) assert.equal(entry.region, `${'a'.repeat(200)}, ${'c'.repeat(190)}`);
  // Province and country alone can exceed the limit: the country is left out as well.
  const huge = await provider({ results: [{ ...long(1, 'd'), country: 'c'.repeat(200) }] })
    .search({ query: 'Merkez', limit: 5, language: 'tr' });
  assert.deepEqual(huge.places.map((entry) => entry.region), ['a'.repeat(200)]);
  // One that still fits keeps the district.
  const fits = (id: number, admin2: string) => ({ ...long(id, admin2), admin1: 'Mersin', country: 'Türkiye' });
  const kept = await provider({ results: [fits(1, 'Erdemli'), fits(2, 'Aydıncık')] })
    .search({ query: 'Merkez', limit: 5, language: 'tr' });
  assert.deepEqual(kept.places.map((entry) => entry.region), ['Erdemli, Mersin, Türkiye', 'Aydıncık, Mersin, Türkiye']);
});
