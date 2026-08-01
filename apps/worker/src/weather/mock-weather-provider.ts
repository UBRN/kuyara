import { weatherConditionCodes, type WeatherConditionCode } from '@kuyara/contracts';

import type {
  ProviderLocation,
  ProviderWeatherMeasurements,
  ProviderWeatherSnapshot,
  WeatherProvider,
} from './weather-provider.ts';

type Dependencies = Readonly<{ now: () => string }>;

function localDateKey(timestamp: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function deterministicSeed(location: ProviderLocation): number {
  return Math.abs(location.latitudeE2 * 31 + location.longitudeE2 * 17);
}

function measurements(
  baseTemperature: number,
  condition: WeatherConditionCode,
  seed: number,
  offset: number,
): ProviderWeatherMeasurements {
  const temperatureOffset = Math.min(offset, 4) * 0.5;
  const wetCondition = ['drizzle', 'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm']
    .includes(condition);
  return {
    temperatureCelsius: baseTemperature + temperatureOffset,
    apparentTemperatureCelsius: baseTemperature - 1 + temperatureOffset,
    condition,
    precipitationProbability: wetCondition ? 0.55 : (seed % 20) / 100,
    windSpeedMetersPerSecond: 2 + (seed % 50) / 10,
    humidity: 0.4 + (seed % 40) / 100,
    uvIndex: seed % 9,
  };
}

export class DeterministicMockWeatherProvider implements WeatherProvider {
  private readonly dependencies: Dependencies;

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies;
  }

  async fetchWeather(location: ProviderLocation): Promise<ProviderWeatherSnapshot> {
    const fetchedAt = this.dependencies.now();
    const fetchedDate = new Date(fetchedAt);
    const seed = deterministicSeed(location);
    const baseTemperature = 8 + (seed % 140) / 10;
    const condition = weatherConditionCodes[seed % weatherConditionCodes.length];
    const current = measurements(baseTemperature, condition, seed, 0);
    const start = new Date(fetchedDate);
    start.setUTCMinutes(0, 0, 0);
    const currentLocalDate = localDateKey(fetchedAt, location.timeZone);
    const hourly = [];

    for (let offset = 0; offset < 25; offset += 1) {
      const forecastAt = new Date(start.getTime() + offset * 60 * 60 * 1000).toISOString();
      if (localDateKey(forecastAt, location.timeZone) !== currentLocalDate) break;
      hourly.push({
        ...measurements(baseTemperature, condition, seed, offset),
        forecastAt,
      });
    }

    return {
      timeZone: location.timeZone,
      fetchedAt,
      provenance: 'sample',
      current: { ...current, observedAt: fetchedAt },
      minimumTemperatureCelsius: baseTemperature - 4,
      maximumTemperatureCelsius: baseTemperature + 4,
      hourly,
    };
  }
}
