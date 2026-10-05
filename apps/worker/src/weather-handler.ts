import {
  weatherV1ErrorSchema,
  weatherV1Path,
  weatherV1RequestSchema,
  weatherV2Path,
  type WeatherV1ErrorCode,
} from '@kuyara/contracts';

import { readRouteRequest, type RateLimiter } from './json-request.ts';
import { createErrorResponse, jsonHeaders, refusalResponse } from './json-response.ts';

import {
  InvalidProviderWeatherError,
  mapProviderWeatherToApi,
  mapProviderWeatherToApiV2,
} from './weather/provider-weather-mapper.ts';
import type { WeatherProvider } from './weather/weather-provider.ts';

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
    const outcome = await readRouteRequest(request, {
      limiter: dependencies.rateLimiter,
      scope: { keyPrefix: 'weather', route: url.pathname, limiter: 'weather_burst' },
      schema: weatherV1RequestSchema,
      maxBytes: weatherRequestMaxBytes,
    });
    if (outcome.kind !== 'ok') return refusalResponse(errorResponse, outcome.kind, 'weather_unavailable');

    let providerSnapshot;
    try {
      providerSnapshot = await dependencies.provider.fetchWeather(outcome.data);
    } catch {
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
