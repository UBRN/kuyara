import type { WeatherV2Data } from '@kuyara/contracts';

import type { ProvidedWeatherSnapshot } from '@/features/weather/data/weather-provider';
import type { ActiveLocation } from '@/features/weather/domain/weather';

export class WorkerWeatherMappingError extends Error {
  constructor() {
    super('The Worker weather response does not match the requested location.');
    this.name = 'WorkerWeatherMappingError';
  }
}

export function mapWorkerWeatherToProvidedSnapshot(
  location: ActiveLocation,
  data: WeatherV2Data,
): ProvidedWeatherSnapshot {
  if (data.timeZone !== location.timeZone) throw new WorkerWeatherMappingError();

  return {
    locationKey: location.locationKey,
    timeZone: data.timeZone,
    fetchedAt: data.fetchedAt,
    origin: {
      kind: data.origin.kind,
      sourceId: data.origin.sourceId,
    },
    current: data.current,
    minimumTemperatureCelsius: data.minimumTemperatureCelsius,
    maximumTemperatureCelsius: data.maximumTemperatureCelsius,
    hourly: data.hourly,
    daily: data.daily,
  };
}
