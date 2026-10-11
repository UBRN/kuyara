import {
  ianaTimeZoneSchema,
  locationDisplayNameSchema,
  placeSearchRegionMaxLength,
  type PlaceSearchV1Data,
  type PlaceSearchV1Request,
} from '@kuyara/contracts';
import { z } from 'zod';

import { withDeadline } from '../attempt-timeout.ts';
import { defaultFetch, type FetchLike } from '../default-fetch.ts';

// The most entries Open-Meteo returns for one call. One call always asks for all of them, so
// `rankPlaces` can reach neighbourhoods that sit far down a long list.
const upstreamCandidateCount = 100;

const rawPlaceSchema = z.object({
  id: z.number().int().positive().safe(),
  name: locationDisplayNameSchema,
  admin1: locationDisplayNameSchema.optional(),
  // Decoration only: a blank or over-long district means "no district", never a lost place.
  admin2: locationDisplayNameSchema.optional().catch(undefined),
  country: locationDisplayNameSchema.optional(),
  country_code: z.string().regex(/^[A-Z]{2}$/).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: ianaTimeZoneSchema.optional(),
  // Ranking hints only: a missing or unreadable one never drops the place.
  feature_code: z.string().optional().catch(undefined),
  population: z.number().optional().catch(undefined),
}).refine((place) => Boolean(place.admin1 || place.country || place.country_code));
type RawPlace = z.infer<typeof rawPlaceSchema>;
// The envelope is deliberately loose about entry shape: each entry is validated on its own below,
// so one malformed result no longer drops the whole answer. The bounds that are a contract concern
// (at most `upstreamCandidateCount` entries, and a body that is neither results nor a timing field
// is not an answer at all) stay here.
const rawResponseSchema = z.object({
  results: z.array(z.unknown()).max(upstreamCandidateCount).optional(),
  generationtime_ms: z.number().nonnegative().optional(),
}).refine((body) => body.results !== undefined || body.generationtime_ms !== undefined);

// Open-Meteo folds every Turkish letter except dotless ı (U+0131), which has no Unicode
// decomposition: "Bagcilar" answers nothing while "Bağcılar" answers Istanbul's district, and
// "Diyarbakir" answers two airports while "Diyarbakır" answers the city (probed 2026-09-15).
// Uppercase I is already folded ("ISTANBUL", "IZMIR" resolve), so only lowercase i positions are
// candidates: each single position left to right, then every position, capped at three.
const maxSpellingRetries = 3;
export function dotlessSpellings(query: string): string[] {
  if (query.includes('ı')) return [];
  const spellings: string[] = [];
  for (let index = query.indexOf('i'); index !== -1; index = query.indexOf('i', index + 1)) {
    spellings.push(`${query.slice(0, index)}ı${query.slice(index + 1)}`);
  }
  if (spellings.length > 1) spellings.push(query.replaceAll('i', 'ı'));
  return spellings.slice(0, maxSpellingRetries);
}

// A query typed with dotless ı finds nothing upstream ("ıstanbul"), while the same word with a
// plain i resolves; the one retry swaps every ı back.
const dotfulSpelling = (query: string) => (query.includes('ı') ? [query.replaceAll('ı', 'i')] : []);
const turkishLetters = /[çğıöşüÇĞİÖŞÜ]/;
const plainAscii = /^[\x00-\x7f]*$/;

/**
 * The spellings worth one more upstream call, in order. A typed query that already carries
 * Turkish letters and returned two places is understood and spends nothing. A full first page
 * normally spends nothing either, except a Turkish request whose page holds no place in Türkiye
 * for a plain ASCII query: "agri" fills the page with Agri in Italy and hides Ağrı, so one call
 * with the all-ı spelling follows. `preferTurkey` marks that case (Türkiye hits go first).
 */
function spellingRetries(request: PlaceSearchV1Request, firstPage: RawPlace[]) {
  const { query, limit, language } = request;
  const candidates = [...dotfulSpelling(query), ...dotlessSpellings(query)];
  const preferTurkey = language === 'tr' && plainAscii.test(query) && !firstPage.some((place) => place.country_code === 'TR');
  if (firstPage.length >= limit) return { spellings: preferTurkey ? candidates.slice(-1) : [], preferTurkey };
  const understood = turkishLetters.test(query) && firstPage.length >= 2;
  return { spellings: understood ? [] : candidates, preferTurkey };
}

// Province names repeat the place ("İstanbul, İstanbul"); compare without case or the dotted/dotless I.
const foldName = (name: string) => name.toLocaleLowerCase('tr').replaceAll('ı', 'i');

// Name comparison for ranking: case, the dotted/dotless I and diacritics ("Goztepe" is "Göztepe") are ignored.
const matchKey = (name: string) => foldName(name.normalize('NFD').replace(/\p{M}/gu, ''));

/**
 * Open-Meteo lists the names that match, populated places first. GeoNames leaves the city
 * neighbourhoods (feature code PPLX: Bostancı, Moda, Göztepe) without a population, so they sit
 * behind hundreds of villages of the same name and never reach a short answer. The leading run of
 * populated entries (the cities a plain query is after) keeps its places; from the first entry
 * without a population on, neighbourhoods named exactly like the query come first. Everything else
 * keeps upstream order.
 */
function rankPlaces(places: RawPlace[], query: string): RawPlace[] {
  const populated = places.findIndex((place) => place.population === undefined);
  const head = populated === -1 ? places.length : populated;
  const wanted = matchKey(query);
  const isNeighbourhood = (place: RawPlace) => place.feature_code === 'PPLX' && matchKey(place.name) === wanted;
  const tail = places.slice(head);
  return [...places.slice(0, head), ...tail.filter(isNeighbourhood), ...tail.filter((place) => !isNeighbourhood(place))];
}

/**
 * A search answer. `degraded` marks one whose spelling top-up failed: it is a valid answer for
 * this request but not worth keeping, so the handler reads it before the contract strips it.
 */
export type PlaceSearchAnswer = PlaceSearchV1Data & { degraded?: true };

export class PlaceSearchProviderError extends Error {
  constructor() {
    super('Place search is unavailable.');
    this.name = 'PlaceSearchProviderError';
  }
}

export class OpenMeteoPlaceProvider {
  private readonly fetch: FetchLike;
  private readonly timeoutMs: number;

  constructor(dependencies: { fetch?: FetchLike; timeoutMs?: number } = {}) {
    this.fetch = dependencies.fetch ?? defaultFetch();
    this.timeoutMs = dependencies.timeoutMs ?? 4000;
  }

  async search(request: PlaceSearchV1Request): Promise<PlaceSearchAnswer> {
    try {
      return await withDeadline(this.timeoutMs, (signal) => this.searchWithin(request, signal));
    } catch {
      throw new PlaceSearchProviderError();
    }
  }

  private async searchWithin(request: PlaceSearchV1Request, signal: AbortSignal): Promise<PlaceSearchAnswer> {
    let valid = await this.fetchPlaces(request, request.query, signal);
    // The typed answer stays first and in upstream order; a spelling retry only appends ids it
    // did not contain, under the same deadline. A retry that fails (timeout, upstream error,
    // unreadable body) is a lost top-up, not a lost answer: what the typed query returned stands.
    let degraded = false;
    // The retry rules were written for an upstream page of `limit` entries, so they read the same view.
    const { spellings, preferTurkey } = spellingRetries(request, valid.slice(0, request.limit));
    const extras: RawPlace[] = [];
    const isTurkey = (place: RawPlace) => place.country_code === 'TR';
    for (const spelling of spellings) {
      try {
        extras.push(...await this.fetchPlaces(request, spelling, signal));
      } catch {
        degraded = true;
        break;
      }
      const seen = new Set(valid.map((place) => place.id));
      const unseen = extras.filter((place) => !seen.has(place.id));
      if (preferTurkey ? unseen.some(isTurkey) : valid.length + new Set(unseen.map((place) => place.id)).size >= request.limit) break;
    }
    const ordered = preferTurkey
      ? [...extras.filter(isTurkey), ...valid, ...extras.filter((place) => !isTurkey(place))]
      : [...valid, ...extras];
    const seen = new Set<number>();
    valid = rankPlaces(ordered.filter((place) => !seen.has(place.id) && seen.add(place.id)), request.query).slice(0, request.limit);
    // Rows the user could not tell apart (same name, same province and country) carry the
    // district too; every other row keeps the short region it always had.
    // The contract bounds `region`; when the full label would exceed it, the district and then
    // the province are left out in turn (each part is at most 200 characters, so the last
    // candidate always fits).
    const regionOf = (place: RawPlace, withDistrict: boolean) => {
      const parts = (...candidates: (string | undefined)[]) =>
        [...new Set(candidates.filter(Boolean))].join(', ');
      const country = place.country ?? place.country_code;
      const admin1 = country && place.admin1 && foldName(place.admin1) === foldName(place.name) ? undefined : place.admin1;
      const district = withDistrict && place.admin2 !== place.name ? place.admin2 : undefined;
      return [
        parts(district, admin1, country),
        parts(admin1, country),
        parts(admin1),
        parts(country),
      ].find((region) => region.length > 0 && region.length <= placeSearchRegionMaxLength) ?? '';
    };
    const labelCounts = new Map<string, number>();
    for (const place of valid) {
      const label = `${place.name}\u0000${regionOf(place, false)}`;
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }
    const places = valid.map((place) => ({
      id: `place.${place.id}`,
      displayName: place.name,
      region: regionOf(place, (labelCounts.get(`${place.name}\u0000${regionOf(place, false)}`) ?? 0) > 1),
      latitudeE2: Math.round(place.latitude * 100) || 0,
      longitudeE2: Math.round(place.longitude * 100) || 0,
      timeZone: place.timezone ?? null,
    }));
    return { places, attribution: ['open-meteo', 'geonames'], ...(degraded ? { degraded: true as const } : {}) };
  }

  private async fetchPlaces(request: PlaceSearchV1Request, name: string, signal: AbortSignal): Promise<RawPlace[]> {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    // A hyphen is a space upstream ("Saint-Petersburg" finds nothing, "Saint Petersburg" does).
    url.searchParams.set('name', name.replaceAll('-', ' ').trim() || name);
    url.searchParams.set('count', String(upstreamCandidateCount));
    url.searchParams.set('language', request.language);
    url.searchParams.set('format', 'json');
    // Workers' fetch accepts only 'follow' and 'manual'; 'manual' surfaces a redirect as a
    // non-ok response, which the check below rejects.
    const response = await this.fetch(url, { signal, redirect: 'manual' });
    if (!response.ok) throw new PlaceSearchProviderError();
    const raw = rawResponseSchema.parse(await response.json());
    const entries = raw.results ?? [];
    const valid = entries.flatMap((entry) => {
      const result = rawPlaceSchema.safeParse(entry);
      return result.success ? [result.data] : [];
    });
    if (valid.length < entries.length) {
      // Counts only: never the query, the coordinates or the entry itself.
      console.warn({ event: 'place_result_dropped', dropped: entries.length - valid.length, kept: valid.length });
    }
    // An absent or empty `results` is a valid no-hit answer, but entries that are all unreadable
    // are an invalid provider response, not "no results": the provider did answer with something
    // we could not read, so it fails the same way a parse failure does.
    if (entries.length > 0 && valid.length === 0) throw new PlaceSearchProviderError();
    return valid;
  }
}
