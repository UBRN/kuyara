import type { z } from 'zod';

import { defaultFetch, type FetchLike } from '../default-fetch.ts';
import { mapProviderWeatherToApiV2 } from './provider-weather-mapper.ts';
import type { ProviderWeatherSnapshot } from './weather-provider.ts';
import {
  WeatherProviderError,
  type WeatherProviderErrorKind,
} from './weather-provider-error.ts';

/**
 * One HTTP status to error-kind table for every weather provider. A 404 means the provider
 * holds no data for this location, not that the request is malformed, so the chain advances;
 * only 400 stays ineligible for fallback.
 */
export function weatherHttpErrorKind(status: number): WeatherProviderErrorKind {
  if (status === 429) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400) return 'invalid_request';
  if (status === 404) return 'availability';
  return 'upstream';
}

export type ProviderFetchOptions<Raw> = Readonly<{
  fetch: FetchLike | undefined;
  url: URL;
  init?: Omit<RequestInit, 'signal'>;
  signal?: AbortSignal;
  schema: z.ZodType<Raw>;
  map: (raw: Raw) => ProviderWeatherSnapshot;
}>;

/**
 * The call every weather adapter makes: fetch, classify the HTTP status, read JSON, parse it
 * with the provider's schema, map it, and run the v2 self-check. Every failure is a closed
 * `WeatherProviderError`; no upstream text or credential reaches it.
 */
export async function fetchProviderWeather<Raw>(
  options: ProviderFetchOptions<Raw>,
): Promise<ProviderWeatherSnapshot> {
  const { signal } = options;
  let response: Response;
  try {
    response = await (options.fetch ?? defaultFetch())(options.url, { ...options.init, signal });
  } catch {
    throw new WeatherProviderError(signal?.aborted ? 'timeout' : 'availability');
  }
  if (!response.ok) throw new WeatherProviderError(weatherHttpErrorKind(response.status));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new WeatherProviderError(signal?.aborted ? 'timeout' : 'invalid_response');
  }
  const parsed = options.schema.safeParse(body);
  if (!parsed.success) throw new WeatherProviderError('invalid_response');

  try {
    const snapshot = options.map(parsed.data);
    // The self-check runs the richer v2 shape: a daily block this adapter cannot fill
    // fails the attempt here, so the chain moves on instead of serving a hollow /v2.
    mapProviderWeatherToApiV2(snapshot);
    return snapshot;
  } catch {
    throw new WeatherProviderError('invalid_response');
  }
}
