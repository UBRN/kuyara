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
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  timezone: ianaTimeZoneSchema.optional(),
}).refine((place) => Boolean(place.admin1 || place.country || place.country_code));
const rawResponseSchema = z.object({
  results: z.array(rawPlaceSchema).max(placeSearchMaxResults).optional(),
  generationtime_ms: z.number().finite().nonnegative().optional(),
}).refine((body) => body.results !== undefined || body.generationtime_ms !== undefined);

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
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', request.query);
    url.searchParams.set('count', String(request.limit));
    url.searchParams.set('language', request.language);
    url.searchParams.set('format', 'json');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // Workers' fetch accepts only 'follow' and 'manual'; 'manual' surfaces a redirect as a
      // non-ok response, which the check below rejects.
      const response = await this.fetch(url, { signal: controller.signal, redirect: 'manual' });
      if (!response.ok) throw new PlaceSearchProviderError();
      const raw = rawResponseSchema.parse(await response.json());
      const places = (raw.results ?? []).map((place) => ({
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
}
