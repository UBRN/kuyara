import {
  weatherSourceIds,
  weatherV1SuccessSchema,
  weatherV2SuccessSchema,
  type WeatherV1Success,
  type WeatherV2Success,
} from '@kuyara/contracts';
import type { z } from 'zod';

import type { ProviderWeatherSnapshot } from './weather-provider.ts';

export class InvalidProviderWeatherError extends Error {
  constructor() {
    super('The provider weather result is invalid.');
    this.name = 'InvalidProviderWeatherError';
  }
}

/**
 * One payload, two schemas. The v1 response schema has no `daily` key and `z.object` strips
 * unknown keys, so parsing this payload with it yields exactly the body /v1 has always sent;
 * the v2 schema keeps `daily`. That is what lets /v1 stay byte-identical for the installed
 * strict binaries while /v2 carries the daily block.
 */
function providerWeatherPayload(snapshot: ProviderWeatherSnapshot): unknown {
  try {
    return {
      data: {
        timeZone: snapshot.timeZone,
        fetchedAt: snapshot.fetchedAt,
        origin: { kind: snapshot.provenance, sourceId: snapshot.sourceId },
        current: snapshot.current,
        minimumTemperatureCelsius: snapshot.minimumTemperatureCelsius,
        maximumTemperatureCelsius: snapshot.maximumTemperatureCelsius,
        hourly: snapshot.hourly,
        daily: snapshot.daily,
      },
    };
  } catch {
    // A provider that returned something other than a snapshot at all, null included.
    throw new InvalidProviderWeatherError();
  }
}

function checked<Response extends { data: { origin: { sourceId: string } } }>(
  result: z.ZodSafeParseResult<Response>,
): Response {
  if (!result.success) throw new InvalidProviderWeatherError();
  // The shared schema reads an unlisted source id as 'unknown' so installed binaries survive a
  // new provider; the Worker itself must never emit one, so the runtime gate stays closed here.
  const knownSourceIds: readonly string[] = weatherSourceIds;
  if (!knownSourceIds.includes(result.data.data.origin.sourceId)) throw new InvalidProviderWeatherError();
  return result.data;
}

export function mapProviderWeatherToApi(snapshot: ProviderWeatherSnapshot): WeatherV1Success {
  return checked(weatherV1SuccessSchema.safeParse(providerWeatherPayload(snapshot)));
}

export function mapProviderWeatherToApiV2(snapshot: ProviderWeatherSnapshot): WeatherV2Success {
  return checked(weatherV2SuccessSchema.safeParse(providerWeatherPayload(snapshot)));
}
