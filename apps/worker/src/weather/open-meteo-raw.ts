import {
  isValidWeatherHourlyForecastWindow,
  isWeatherHourlyForecastInWindow,
  weatherDailyForecastMaximumEntries,
  weatherHourlyForecastMaximumEntries,
  weatherLocalDateKey,
  type WeatherConditionCode,
} from '@kuyara/contracts';
import { z } from 'zod';

import type {
  ProviderDailyForecast,
  ProviderLocation,
  ProviderWeatherMeasurements,
  ProviderWeatherSnapshot,
} from './weather-provider.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

const percentageSchema = z.number().min(0).max(100);
const nonNegativeSchema = z.number().min(0);
const weatherCodeSchema = z.number().int();
const hourlyEntrySchema = z.object({
  temperature_2m: z.number(),
  apparent_temperature: z.number(),
  relative_humidity_2m: percentageSchema,
  weather_code: weatherCodeSchema,
  wind_speed_10m: nonNegativeSchema,
  precipitation_probability: percentageSchema,
  uv_index: nonNegativeSchema,
});
const dailyEntrySchema = z.object({
  temperature_2m_min: z.number(),
  temperature_2m_max: z.number(),
  weather_code: weatherCodeSchema,
  precipitation_probability_max: percentageSchema,
  precipitation_sum: nonNegativeSchema.nullable(),
});

const currentSchema = z.object({
  time: z.string().min(1),
  temperature_2m: z.number(),
  apparent_temperature: z.number(),
  relative_humidity_2m: percentageSchema,
  weather_code: weatherCodeSchema,
  wind_speed_10m: nonNegativeSchema,
});

const hourlySchema = z.object({
  time: z.array(z.string().min(1)).min(1),
  temperature_2m: z.array(z.unknown()).min(1),
  apparent_temperature: z.array(z.unknown()).min(1),
  relative_humidity_2m: z.array(z.unknown()).min(1),
  weather_code: z.array(z.unknown()).min(1),
  wind_speed_10m: z.array(z.unknown()).min(1),
  precipitation_probability: z.array(z.unknown()).min(1),
  uv_index: z.array(z.unknown()).min(1),
}).superRefine((value, context) => {
  const length = value.time.length;
  for (const [key, values] of Object.entries(value)) {
    if (values.length !== length) {
      context.addIssue({
        code: 'custom',
        message: 'Hourly arrays must have equal lengths.',
        path: [key],
      });
    }
  }
});

// Open-Meteo answers `null` for a daily variable past its own horizon, so the three variables
// this Goal added are nullable per entry; the mapper stops at the first day it cannot describe
// instead of guessing one.
const dailySchema = z.object({
  time: z.array(z.string().min(1)).min(1),
  temperature_2m_min: z.array(z.unknown()).min(1),
  temperature_2m_max: z.array(z.unknown()).min(1),
  weather_code: z.array(z.unknown()).min(1),
  precipitation_probability_max: z.array(z.unknown()).min(1),
  precipitation_sum: z.array(z.unknown()).min(1),
}).superRefine((value, context) => {
  const length = value.time.length;
  for (const [key, values] of Object.entries(value)) {
    if (values.length !== length) {
      context.addIssue({
        code: 'custom',
        message: 'Daily arrays must have equal lengths.',
        path: [key],
      });
    }
  }
});

export const openMeteoResponseSchema = z.object({
  // Requesting a non-UTC timezone makes every `time` a zone-local wall clock with no
  // offset in the string, so the offset the response carries is what turns one back into
  // an instant. `daily.time` stays a plain local `YYYY-MM-DD` date.
  utc_offset_seconds: z.number().int(),
  current: currentSchema,
  hourly: hourlySchema,
  daily: dailySchema,
});

export type OpenMeteoResponse = z.infer<typeof openMeteoResponseSchema>;

const conditions = new Map<number, WeatherConditionCode>([
  [0, 'clear'],
  [1, 'mostly_clear'],
  [2, 'partly_cloudy'],
  [3, 'cloudy'],
  [45, 'fog'], [48, 'fog'],
  [51, 'drizzle'], [53, 'drizzle'], [55, 'drizzle'],
  [56, 'sleet'], [57, 'sleet'],
  [61, 'rain'], [63, 'rain'],
  [65, 'heavy_rain'],
  [66, 'sleet'], [67, 'sleet'],
  [71, 'snow'], [73, 'snow'], [75, 'snow'], [77, 'snow'],
  [80, 'rain'], [81, 'rain'],
  [82, 'heavy_rain'],
  [85, 'snow'], [86, 'snow'],
  [95, 'thunderstorm'], [96, 'thunderstorm'], [99, 'thunderstorm'],
]);

export function mapOpenMeteoWeatherCode(code: number): WeatherConditionCode {
  const condition = conditions.get(code);
  if (condition === undefined) throw new WeatherProviderError('invalid_response');
  return condition;
}

function utcIso(timestamp: string, utcOffsetSeconds = 0): string {
  const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/u.test(timestamp);
  const milliseconds = explicitZone
    ? Date.parse(timestamp)
    : Date.parse(`${timestamp}Z`) - utcOffsetSeconds * 1000;
  if (!Number.isFinite(milliseconds)) throw new WeatherProviderError('invalid_response');
  return new Date(milliseconds).toISOString();
}

function mapHourly(raw: OpenMeteoResponse['hourly'], utcOffsetSeconds: number, observedAt: string) {
  return raw.time.map((time, index) => ({ forecastAt: utcIso(time, utcOffsetSeconds), index }))
    .filter(({ forecastAt }) => isWeatherHourlyForecastInWindow(forecastAt, observedAt))
    .sort((left, right) => left.forecastAt.localeCompare(right.forecastAt))
    .slice(0, weatherHourlyForecastMaximumEntries)
    .map(({ forecastAt, index }) => {
      const parsed = hourlyEntrySchema.safeParse({
        temperature_2m: raw.temperature_2m[index],
        apparent_temperature: raw.apparent_temperature[index],
        relative_humidity_2m: raw.relative_humidity_2m[index],
        weather_code: raw.weather_code[index],
        wind_speed_10m: raw.wind_speed_10m[index],
        precipitation_probability: raw.precipitation_probability[index],
        uv_index: raw.uv_index[index],
      });
      if (!parsed.success) throw new WeatherProviderError('invalid_response');
      const entry = parsed.data;
      return {
        temperatureCelsius: entry.temperature_2m,
        apparentTemperatureCelsius: entry.apparent_temperature,
        condition: mapOpenMeteoWeatherCode(entry.weather_code),
        precipitationProbability: entry.precipitation_probability / 100,
        windSpeedMetersPerSecond: entry.wind_speed_10m,
        humidity: entry.relative_humidity_2m / 100,
        uvIndex: entry.uv_index,
        forecastAt,
      };
    });
}

function readDailyEntry(raw: OpenMeteoResponse['daily'], index: number) {
  const parsed = dailyEntrySchema.safeParse({
    temperature_2m_min: raw.temperature_2m_min[index],
    temperature_2m_max: raw.temperature_2m_max[index],
    weather_code: raw.weather_code[index],
    precipitation_probability_max: raw.precipitation_probability_max[index],
    precipitation_sum: raw.precipitation_sum[index],
  });
  if (!parsed.success) throw new WeatherProviderError('invalid_response');
  return parsed.data;
}

export function mapOpenMeteoResponse(
  raw: OpenMeteoResponse,
  location: ProviderLocation,
  fetchedAt: string,
): ProviderWeatherSnapshot {
  const observedAt = utcIso(raw.current.time, raw.utc_offset_seconds);
  const hourly = mapHourly(raw.hourly, raw.utc_offset_seconds, observedAt);
  if (!isValidWeatherHourlyForecastWindow(hourly, observedAt)) {
    throw new WeatherProviderError('invalid_response');
  }
  const nearest = hourly.reduce((best, entry) => (
    Math.abs(Date.parse(entry.forecastAt) - Date.parse(observedAt))
      < Math.abs(Date.parse(best.forecastAt) - Date.parse(observedAt))
      ? entry
      : best
  ));
  const current: ProviderWeatherMeasurements & Readonly<{ observedAt: string }> = {
    temperatureCelsius: raw.current.temperature_2m,
    apparentTemperatureCelsius: raw.current.apparent_temperature,
    condition: mapOpenMeteoWeatherCode(raw.current.weather_code),
    precipitationProbability: nearest.precipitationProbability,
    windSpeedMetersPerSecond: raw.current.wind_speed_10m,
    humidity: raw.current.relative_humidity_2m / 100,
    uvIndex: nearest.uvIndex,
    observedAt,
  };
  // The low and the high belong to the local day the observation falls in, which is the
  // entry the response labels with that date, not necessarily the first one.
  const localDate = weatherLocalDateKey(observedAt, location.timeZone);
  const todayIndex = raw.daily.time.indexOf(localDate ?? '');
  if (todayIndex < 0) throw new WeatherProviderError('invalid_response');
  const today = readDailyEntry(raw.daily, todayIndex);

  const minimumTemperatureCelsius = Math.min(
    today.temperature_2m_min,
    current.temperatureCelsius,
  );
  const maximumTemperatureCelsius = Math.max(
    today.temperature_2m_max,
    current.temperatureCelsius,
  );
  const daily: ProviderDailyForecast[] = [];
  for (
    let index = todayIndex;
    index < raw.daily.time.length && daily.length < weatherDailyForecastMaximumEntries;
    index += 1
  ) {
    const weatherCode = raw.daily.weather_code[index];
    const probability = raw.daily.precipitation_probability_max[index];
    if (weatherCode === null || probability === null) break;
    const entry = index === todayIndex ? today : readDailyEntry(raw.daily, index);
    daily.push({
      dateKey: raw.daily.time[index],
      condition: mapOpenMeteoWeatherCode(entry.weather_code),
      // Today's row is the card's own low and high, clamped around the current reading, so the
      // two never contradict each other on screen.
      minimumTemperatureCelsius: index === todayIndex
        ? minimumTemperatureCelsius
        : entry.temperature_2m_min,
      maximumTemperatureCelsius: index === todayIndex
        ? maximumTemperatureCelsius
        : entry.temperature_2m_max,
      precipitationProbability: entry.precipitation_probability_max / 100,
      precipitationMillimetres: entry.precipitation_sum,
    });
  }

  return {
    timeZone: location.timeZone,
    fetchedAt: utcIso(fetchedAt),
    provenance: 'live',
    sourceId: 'open-meteo',
    current,
    minimumTemperatureCelsius,
    maximumTemperatureCelsius,
    hourly,
    daily,
  };
}
