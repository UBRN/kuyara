import {
  ianaTimeZoneSchema,
  placeSearchMaxResults,
  placeSearchV1RequestSchema,
  placeSearchV1SuccessSchema,
  type PlaceSearchV1Data,
  type PlaceSearchV1Request,
} from '@kuyara/contracts';
import { z } from 'zod';

const rawPlaceSchema = z.object({
  id: z.number().int().positive().safe(),
  name: z.string().trim().min(1).max(200),
  admin1: z.string().trim().min(1).max(200).optional(),
  country: z.string().trim().min(1).max(200).optional(),
  country_code: z.string().regex(/^[A-Z]{2}$/).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: ianaTimeZoneSchema.optional(),
}).refine((place) => Boolean(place.admin1 || place.country || place.country_code));
type RawPlace = z.infer<typeof rawPlaceSchema>;
// The envelope is deliberately loose about entry shape: each entry is validated on its own below,
// so one malformed result no longer drops the whole answer. The bounds that are a contract concern
// (at most `placeSearchMaxResults` entries, and a body that is neither results nor a timing field
// is not an answer at all) stay here.
const rawResponseSchema = z.object({
  results: z.array(z.unknown()).max(placeSearchMaxResults).optional(),
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

export class PlaceSearchProviderError extends Error {
  constructor() {
    super('Place search is unavailable.');
    this.name = 'PlaceSearchProviderError';
  }
}

export class OpenMeteoPlaceProvider {
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(dependencies: { fetch?: typeof globalThis.fetch; timeoutMs?: number } = {}) {
    // Bind the global: storing `globalThis.fetch` on the instance and calling it as `this.fetch`
    // passes the provider as `this`, which workerd rejects with "Illegal invocation" and Node
    // tolerates. Every production search returned 503 until this was found on 2026-09-08.
    this.fetch = dependencies.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = dependencies.timeoutMs ?? 4000;
  }

  async search(input: PlaceSearchV1Request): Promise<PlaceSearchV1Data> {
    const request = placeSearchV1RequestSchema.parse(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const valid = await this.fetchPlaces(request, request.query, controller.signal);
      // The typed answer stays first and in upstream order; a spelling retry only appends ids it
      // did not contain, under the same deadline. A retry that fails (timeout, upstream error,
      // unreadable body) is a lost top-up, not a lost answer: what the typed query returned stands.
      if (valid.length < request.limit) {
        for (const spelling of dotlessSpellings(request.query)) {
          let extra: RawPlace[];
          try {
            extra = await this.fetchPlaces(request, spelling, controller.signal);
          } catch {
            break;
          }
          const seen = new Set(valid.map((place) => place.id));
          for (const place of extra) {
            if (valid.length >= request.limit) break;
            if (!seen.has(place.id)) valid.push(place);
          }
          if (valid.length >= request.limit) break;
        }
      }
      const places = valid.map((place) => ({
        id: `place.${place.id}`,
        displayName: place.name,
        region: [...new Set([place.admin1, place.country ?? place.country_code].filter(Boolean))].join(', '),
        latitudeE2: Math.round(place.latitude * 100) || 0,
        longitudeE2: Math.round(place.longitude * 100) || 0,
        timeZone: place.timezone ?? null,
      }));
      if (places.length > request.limit) throw new PlaceSearchProviderError();
      return placeSearchV1SuccessSchema.parse({
        data: { places, attribution: ['open-meteo', 'geonames'] },
      }).data;
    } catch {
      throw new PlaceSearchProviderError();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchPlaces(request: PlaceSearchV1Request, name: string, signal: AbortSignal): Promise<RawPlace[]> {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', name);
    url.searchParams.set('count', String(request.limit));
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
