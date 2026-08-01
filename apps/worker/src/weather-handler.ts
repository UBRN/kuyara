import {
  weatherV1ErrorSchema,
  weatherV1Path,
  weatherV1RequestSchema,
  type WeatherV1ErrorCode,
} from '@kuyara/contracts';

import { InvalidProviderWeatherError, mapProviderWeatherToApi } from './weather/provider-weather-mapper.ts';
import type { WeatherProvider } from './weather/weather-provider.ts';

type Dependencies = Readonly<{ provider: WeatherProvider }>;

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
} as const;

function errorResponse(
  status: number,
  code: WeatherV1ErrorCode,
  extraHeaders?: Readonly<Record<string, string>>,
): Response {
  const body = weatherV1ErrorSchema.parse({ error: { code } });
  return Response.json(body, {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

export function createWeatherHandler(
  dependencies: Dependencies,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname !== weatherV1Path) return errorResponse(404, 'not_found');
    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', { Allow: 'POST' });
    }
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return errorResponse(400, 'invalid_request');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'invalid_request');
    }

    const requestResult = weatherV1RequestSchema.safeParse(body);
    if (!requestResult.success) return errorResponse(400, 'invalid_request');

    let providerSnapshot;
    try {
      providerSnapshot = await dependencies.provider.fetchWeather(requestResult.data);
    } catch {
      return errorResponse(503, 'weather_unavailable');
    }

    try {
      const response = mapProviderWeatherToApi(providerSnapshot);
      return Response.json(response, { status: 200, headers: jsonHeaders });
    } catch (error) {
      if (error instanceof InvalidProviderWeatherError) {
        return errorResponse(503, 'weather_unavailable');
      }
      return errorResponse(500, 'internal_error');
    }
  };
}
