import {
  weatherV1ErrorSchema,
  weatherV1Path,
  weatherV1RequestSchema,
  weatherV2Path,
  type WeatherV1ErrorCode,
} from '@kuyara/contracts';

import {
  checkRateLimit, isJsonRequest, rateLimitedHeaders, readJsonBody, type RateLimiter,
} from './json-request.ts';
import { createErrorResponse, jsonHeaders } from './json-response.ts';

import {
  InvalidProviderWeatherError,
  mapProviderWeatherToApi,
  mapProviderWeatherToApiV2,
} from './weather/provider-weather-mapper.ts';
import type { WeatherProvider } from './weather/weather-provider.ts';
import { WeatherProviderError } from './weather/weather-provider-error.ts';

type Dependencies = Readonly<{
  provider: WeatherProvider;
  rateLimiter: RateLimiter;
}>;

/**
 * Both weather routes, one handler: same strict request, same rate-limit key and the same
 * provider chain and daily counters, so /v2 can never spend quota /v1 does not. The only
 * difference is which response schema the provider snapshot is mapped through, and the v1
 * schema has no `daily` key, so its body stays exactly what the installed binaries parse.
 */
function responseMapper(pathname: string) {
  if (pathname === weatherV1Path) return mapProviderWeatherToApi;
  if (pathname === weatherV2Path) return mapProviderWeatherToApiV2;
  return undefined;
}

const errorResponse = createErrorResponse<WeatherV1ErrorCode>(weatherV1ErrorSchema);

/**
 * Both weather routes read the same strict request. The limit is at least 1.5 times the
 * largest compact body a client sends (the handler test measures it), and a larger body is
 * the route's invalid_request, refused before it is read in full.
 */
export const weatherRequestMaxBytes = 256;

export function createWeatherHandler(
  dependencies: Dependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const mapResponse = responseMapper(url.pathname);
    if (mapResponse === undefined) return errorResponse(404, 'not_found');
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', { Allow: 'POST' });
    }
    const limit = await checkRateLimit(dependencies.rateLimiter, request, {
      keyPrefix: 'weather',
      route: url.pathname,
      limiter: 'weather_burst',
    });
    // A failing binding answers in the route's own closed code.
    if (limit === 'unavailable') return errorResponse(503, 'weather_unavailable');
    if (limit === 'limited') {
      console.warn({ event: 'rate_limited', route: url.pathname, limiter: 'weather_burst' });
      return errorResponse(429, 'rate_limited', rateLimitedHeaders);
    }
    if (!isJsonRequest(request)) return errorResponse(400, 'invalid_request');

    const body = await readJsonBody(request.body, weatherRequestMaxBytes);
    const requestResult = weatherV1RequestSchema.safeParse(body);
    if (!requestResult.success) return errorResponse(400, 'invalid_request');

    let providerSnapshot;
    try {
      providerSnapshot = await dependencies.provider.fetchWeather(requestResult.data);
    } catch (error) {
      if (error instanceof WeatherProviderError) {
        return errorResponse(503, 'weather_unavailable');
      }
      return errorResponse(503, 'weather_unavailable');
    }

    try {
      const response = mapResponse(providerSnapshot);
      return Response.json(response, { status: 200, headers: jsonHeaders });
    } catch (error) {
      if (error instanceof InvalidProviderWeatherError) {
        return errorResponse(503, 'weather_unavailable');
      }
      return errorResponse(500, 'internal_error');
    }
  };
}
