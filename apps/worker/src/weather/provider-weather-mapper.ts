import {
  weatherV1SuccessSchema,
  type WeatherV1Success,
} from '@kuyara/contracts';

import type { ProviderWeatherSnapshot } from './weather-provider.ts';

export class InvalidProviderWeatherError extends Error {
  constructor() {
    super('The provider weather result is invalid.');
    this.name = 'InvalidProviderWeatherError';
  }
}

export function mapProviderWeatherToApi(
  snapshot: ProviderWeatherSnapshot,
): WeatherV1Success {
  try {
    const result = weatherV1SuccessSchema.safeParse({
      data: {
        timeZone: snapshot.timeZone,
        fetchedAt: snapshot.fetchedAt,
        origin: { kind: snapshot.provenance, sourceId: snapshot.sourceId },
        current: snapshot.current,
        minimumTemperatureCelsius: snapshot.minimumTemperatureCelsius,
        maximumTemperatureCelsius: snapshot.maximumTemperatureCelsius,
        hourly: snapshot.hourly,
      },
    });

    if (!result.success) throw new InvalidProviderWeatherError();
    return result.data;
  } catch (error) {
    if (error instanceof InvalidProviderWeatherError) throw error;
    throw new InvalidProviderWeatherError();
  }
}
