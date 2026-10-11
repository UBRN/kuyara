import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    id: 'place.311046', displayName: 'İzmir', region: 'Türkiye',
    latitudeE2: 3841, longitudeE2: 2714, timeZone: 'Europe/Istanbul',
  }]);
  assert.deepEqual(warnings, []);
  const crowd = (size: number) => Array.from({ length: size }, (_, index) => place(index + 1, 'İzmir', 38.41));
  assert.equal((await provider({ results: crowd(100) }).search(query)).places.length, 5);
  await assert.rejects(() => provider({ results: crowd(101) }).search(query), PlaceSearchProviderError);
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
    'Türkiye',
  ]);
});

test('a malformed district never hides the place', async () => {
  for (const admin2 of ['', '   ', 'x'.repeat(300)]) {
    const { places } = await provider({ results: [{ ...place(1, 'Aydın', 37.84), admin2 }] }).search(query);
    assert.deepEqual(places.map((entry) => [entry.id, entry.region]), [['place.1', 'Türkiye']]);
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

// Upstream answers recorded live from keyless Open-Meteo (11 Oct 2026), trimmed to the fields
// the provider reads.
const row = (id: number, name: string, admin1: string, admin2: string, country_code: string, country: string, latitude: number, longitude: number, timezone: string) => ({
  id, name, latitude, longitude, timezone,
  ...(admin1 ? { admin1 } : {}), ...(admin2 ? { admin2 } : {}),
  ...(country_code ? { country_code } : {}), ...(country ? { country } : {}),
});
const agriAscii = [
  row(8956745, 'Agri', 'Basilicata', 'Provincia di Potenza', 'IT', 'İtalya', 40.41685, 15.7385, 'Europe/Rome'),
  row(2624946, 'Agri', 'Merkezi Danimarka Bölgesi', 'Syddjurs Kommune', 'DK', 'Danimarka', 56.23238, 10.52445, 'Europe/Copenhagen'),
  row(10169392, 'Agri', 'State of Uttarākhand', 'Dehradun', 'IN', 'Hindistan', 30.50128, 77.92514, 'Asia/Kolkata'),
  row(10179597, 'Agri', 'Uttar Pradeş', 'Bijnor', 'IN', 'Hindistan', 29.33627, 78.17617, 'Asia/Kolkata'),
  row(10470641, 'Āgri', 'Madhya Pradesh', 'Seonī', 'IN', 'Hindistan', 21.89512, 79.49617, 'Asia/Kolkata'),
];
const agriDotless = [
  row(309647, 'Ağrı', 'Ağrı', 'Ağrı', 'TR', 'Türkiye Cumhuriyeti', 39.71467, 43.04015, 'Europe/Istanbul'),
  row(148608, 'Ağrı', 'Nahçıvan', 'Ordubad Rayon', 'AZ', 'Azerbaycan', 38.92448, 45.92744, 'Asia/Baku'),
  row(302226, 'Sağlık', 'Konya', 'Meram İlçesi', 'TR', 'Türkiye Cumhuriyeti', 37.83266, 32.04758, 'Europe/Istanbul'),
  row(750771, 'Belyaka', 'Kastamonu', 'Doğanyurt İlçesi', 'TR', 'Türkiye Cumhuriyeti', 42.01067, 33.38878, 'Europe/Istanbul'),
  row(752767, 'Ağrıt', 'Trabzon', 'Ortahisar', 'TR', 'Türkiye Cumhuriyeti', 40.93405, 39.64856, 'Europe/Istanbul'),
];
const istanbul = [
  row(745044, 'İstanbul', 'İstanbul', '', 'TR', 'Türkiye Cumhuriyeti', 41.01384, 28.94966, 'Europe/Istanbul'),
  row(10953465, 'İstanbulboğazı', 'Ordu', 'Perşembe İlçesi', 'TR', 'Türkiye Cumhuriyeti', 41.0641, 37.71004, 'Europe/Istanbul'),
  row(264407, 'İstanbulya Ada', 'South Aegean', 'Dodecanese', 'GR', 'Yunanistan', 36.5758, 26.36221, 'Europe/Athens'),
  row(11838481, 'İstanbul Yeni Havalimanı', 'İstanbul', 'Arnavutköy', 'TR', 'Türkiye Cumhuriyeti', 41.2629, 28.74242, 'Europe/Istanbul'),
  row(12908718, 'Istanbul Old Town', 'İstanbul', 'Fatih', 'TR', 'Türkiye Cumhuriyeti', 41.00783, 28.97838, 'Europe/Istanbul'),
];
const besiktas = [
  row(750734, 'Beşiktaş', 'Ardahan', 'Ardahan', 'TR', 'Türkiye Cumhuriyeti', 40.91119, 42.87263, 'Europe/Istanbul'),
  row(750733, 'Beşiktaş', 'İstanbul', 'Beşiktaş', 'TR', 'Türkiye Cumhuriyeti', 41.04541, 29.00991, 'Europe/Istanbul'),
  row(6969704, 'Beşiktaş', 'Van', 'Çatak İlçesi', 'TR', 'Türkiye Cumhuriyeti', 37.87988, 43.02317, 'Europe/Istanbul'),
];
const saintPetersburg = [
  row(498817, 'St Petersburg', 'St.-Petersburg', '', 'RU', 'Russia', 59.93863, 30.31413, 'Europe/Moscow'),
  row(3578038, 'Saint Petersburg', 'Parish of Saint Peter', '', 'MS', '', 16.7727, -62.21729, 'America/Montserrat'),
  row(5227665, 'Eureka', 'South Dakota', 'McPherson', 'US', 'United States', 45.76943, -99.61956, 'America/Chicago'),
  row(5210484, 'Saint Petersburg', 'Pennsylvania', 'Clarion', 'US', 'United States', 41.16173, -79.65283, 'America/New_York'),
  row(5581640, 'Saint Petersburg', 'Colorado', 'Logan', 'US', 'United States', 40.55554, -102.81714, 'America/Denver'),
];

test('a query typed with dotless ı is retried with i, so "ıstanbul" finds İstanbul', async () => {
  const { calls, provider } = spellingProvider({ istanbul });
  const result = await provider.search({ query: 'ıstanbul', limit: 5, language: 'tr' });
  assert.deepEqual(calls.map((call) => call.name), ['ıstanbul', 'istanbul']);
  assert.deepEqual(result.places.map((entry) => entry.id).slice(0, 2), ['place.745044', 'place.10953465']);
});

test('a Turkish request whose first page has no place in Türkiye also tries the Turkish spelling, its Türkiye hits first', async () => {
  const { calls, provider } = spellingProvider({ agri: agriAscii, agrı: agriDotless });
  const result = await provider.search({ query: 'agri', limit: 5, language: 'tr' });
  // One extra call even though the first page was full; ids are unique and the limit holds.
  assert.deepEqual(calls.map((call) => call.name), ['agri', 'agrı']);
  assert.deepEqual(result.places.map((entry) => entry.id), ['place.309647', 'place.302226', 'place.750771', 'place.752767', 'place.8956745']);
  assert.equal(new Set(result.places.map((entry) => entry.id)).size, result.places.length);
});

test('the Türkiye-first retry needs a Turkish request, an ASCII query and a first page without Türkiye', async () => {
  const english = spellingProvider({ agri: agriAscii, agrı: agriDotless });
  await english.provider.search({ query: 'agri', limit: 5, language: 'en' });
  assert.deepEqual(english.calls.map((call) => call.name), ['agri']);
  // A full first page that already holds a Turkish place spends nothing.
  const turkish = spellingProvider({ istanbul });
  await turkish.provider.search({ query: 'istanbul', limit: 5, language: 'tr' });
  assert.deepEqual(turkish.calls.map((call) => call.name), ['istanbul']);
  // A query with no i has no Turkish-letter variant.
  const none = spellingProvider({ London: agriAscii });
  await none.provider.search({ query: 'London', limit: 5, language: 'tr' });
  assert.deepEqual(none.calls.map((call) => call.name), ['London']);
});

test('a typed query with Turkish letters that already returned two results spends no retry', async () => {
  const { calls, provider } = spellingProvider({ Beşiktaş: besiktas });
  const result = await provider.search({ query: 'Beşiktaş', limit: 5, language: 'tr' });
  assert.deepEqual(calls.map((call) => call.name), ['Beşiktaş']);
  assert.equal(result.places.length, 3);
  // One result is still worth a retry.
  const lone = spellingProvider({ Beşiktaş: besiktas.slice(0, 1) });
  await lone.provider.search({ query: 'Beşiktaş', limit: 5, language: 'tr' });
  assert.deepEqual(lone.calls.map((call) => call.name), ['Beşiktaş', 'Beşıktaş']);
});

test('hyphens in the typed query reach the upstream as spaces', async () => {
  const { calls, provider } = spellingProvider({ 'Saint Petersburg': saintPetersburg });
  const result = await provider.search({ query: 'Saint-Petersburg', limit: 5, language: 'en' });
  assert.deepEqual(calls.map((call) => call.name), ['Saint Petersburg']);
  assert.equal(result.places.length, 5);
  // A query made only of hyphens is sent as typed.
  const dashes = spellingProvider({});
  await dashes.provider.search({ query: '--', limit: 5, language: 'en' });
  assert.deepEqual(dashes.calls.map((call) => call.name), ['--']);
});

test('a province named like the place is not repeated in the region', async () => {
  const { places } = await provider({ results: istanbul }).search({ query: 'istanbul', limit: 5, language: 'tr' });
  assert.deepEqual(places.slice(0, 2).map((entry) => entry.region), ['Türkiye Cumhuriyeti', 'Ordu, Türkiye Cumhuriyeti']);
  assert.equal(places[4].region, 'İstanbul, Türkiye Cumhuriyeti');
  // Case and the Turkish dotted/dotless I are ignored when comparing.
  const mixed = await provider({ results: [row(1, 'Istanbul', 'İstanbul', '', 'TR', 'Republic of Türkiye', 41, 29, 'Europe/Istanbul')] })
    .search({ query: 'istanbul', limit: 5, language: 'en' });
  assert.deepEqual(mixed.places.map((entry) => entry.region), ['Republic of Türkiye']);
  // With no country to fall back on, the province stays.
  const lone = await provider({ results: [row(2, 'Ankara', 'Ankara', '', '', '', 39.9, 32.8, 'Europe/Istanbul')] })
    .search({ query: 'ankara', limit: 5, language: 'tr' });
  assert.deepEqual(lone.places.map((entry) => entry.region), ['Ankara']);
});

// Recorded count=100 answers (tr, 11 Oct 2026), trimmed to the fields the provider reads. Upstream lists
// names that match, populated places first; GeoNames leaves most city neighbourhoods (PPLX) without
// a population, so they sit far down the list.
type Recorded = Record<string, { id: number; name: string; feature_code?: string; population?: number }[]>;
const recorded = JSON.parse(readFileSync(new URL('./open-meteo-count100.fixture.json', import.meta.url), 'utf8')) as Recorded;
function recordedProvider() {
  const requests: URL[] = [];
  const fetch: FetchLike = async (url) => {
    const asked = new URL(String(url));
    requests.push(asked);
    return Response.json({ results: recorded[asked.searchParams.get('name') as string] ?? [] });
  };
  return { requests, provider: new OpenMeteoPlaceProvider({ fetch, timeoutMs: 50 }) };
}
const search = async (name: string, queryText = name) => {
  const { requests, provider } = recordedProvider();
  const { places } = await provider.search({ query: queryText, limit: 5, language: 'tr' });
  return { requests, ids: places.map((entry) => entry.id) };
};
const firstFive = (name: string) => recorded[name].slice(0, 5).map((entry) => `place.${entry.id}`);

test('a city neighbourhood named exactly like the query is reachable in the answer', async () => {
  const bostanci = await search('Bostancı');
  // The populated Bostancı villages keep their places; the Istanbul and Gaziantep neighbourhoods follow.
  assert.deepEqual(bostanci.ids.slice(3, 5), ['place.750483', 'place.' + recorded['Bostancı'][14].id]);
  assert.ok(!bostanci.ids.some((id) => id === `place.${recorded['Bostancı'][29].id}`), 'Bostancık (Ankara) is not a Bostancı');
  assert.equal((await search('Moda')).ids[0], 'place.741510');
  assert.equal((await search('Göztepe')).ids[1], 'place.746514');
  assert.deepEqual((await search('Caferağa')).ids, ['place.6698150']);
});

test('a neighbourhood typed without Turkish letters is found by its folded name', async () => {
  const fetch: FetchLike = async (url) => {
    const name = new URL(String(url)).searchParams.get('name');
    return Response.json({ results: name === 'bostancı' ? recorded['Bostancı'] : [] });
  };
  const result = await new OpenMeteoPlaceProvider({ fetch, timeoutMs: 50 }).search({ query: 'bostanci', limit: 5, language: 'tr' });
  assert.ok(result.places.some((entry) => entry.id === 'place.750483'));
});

test('a plain city query keeps upstream order: the city stays first', async () => {
  for (const name of ['Ankara', 'London', 'Paris', 'Springfield', 'Brooklyn']) {
    assert.deepEqual((await search(name)).ids, firstFive(name), name);
  }
});

test('an unpopulated neighbourhood never outranks the populated city that shares its name', async () => {
  // Çankaya (Ankara, 792189 people) is first upstream; the Antalya, Izmir and Mersin neighbourhoods follow it.
  const { ids } = await search('Çankaya');
  assert.equal(ids[0], `place.${recorded['Çankaya'][0].id}`);
  assert.deepEqual(ids.slice(1, 4), recorded['Çankaya'].filter((entry) => entry.feature_code === 'PPLX').map((entry) => `place.${entry.id}`));
});

test('the search stays one upstream request that asks for the wider candidate list', async () => {
  const { requests } = await search('Moda');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get('count'), '100');
});
