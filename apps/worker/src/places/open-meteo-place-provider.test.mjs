import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenMeteoPlaceProvider, PlaceSearchProviderError, dotlessSpellings } from './open-meteo-place-provider.ts';

const query = { query: 'Ankara', limit: 5, language: 'tr' };
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
function spellingProvider(answers, { throwOn } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const name = new URL(url).searchParams.get('name');
    calls.push({ name, signal: init.signal });
    if (name === throwOn) throw new Error('upstream');
    return Response.json({ results: answers[name] ?? [] });
  };
  return { calls, provider: new OpenMeteoPlaceProvider({ fetch, timeoutMs: 50 }) };
}
const ascii = { query: 'Bagcilar', limit: 2, language: 'en' };

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
