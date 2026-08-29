import {
  weatherLocalDateKey,
  type WeatherConditionCode,
} from '@kuyara/contracts';
import { z } from 'zod';

import type {
  ProviderLocation,
  ProviderWeatherMeasurements,
  ProviderWeatherSnapshot,
} from './weather-provider.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

const percentageSchema = z.number().finite().min(0).max(100);
const nonNegativeSchema = z.number().finite().min(0);
const weatherCodeSchema = z.number().int();

const currentSchema = z.object({
  time: z.string().min(1),
  temperature_2m: z.number().finite(),
  apparent_temperature: z.number().finite(),
  relative_humidity_2m: percentageSchema,
  weather_code: weatherCodeSchema,
  wind_speed_10m: nonNegativeSchema,
});

const hourlySchema = z.object({
  time: z.array(z.string().min(1)).min(1),
  temperature_2m: z.array(z.number().finite()).min(1),
  apparent_temperature: z.array(z.number().finite()).min(1),
  relative_humidity_2m: z.array(percentageSchema).min(1),
  weather_code: z.array(weatherCodeSchema).min(1),
  wind_speed_10m: z.array(nonNegativeSchema).min(1),
  precipitation_probability: z.array(percentageSchema).min(1),
  uv_index: z.array(nonNegativeSchema).min(1),
}).superRefine((value, context) => {
  const length = value.time.length;
  for (const [key, values] of Object.entries(value)) {
    if (values.length !== length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hourly arrays must have equal lengths.',
        path: [key],
      });
    }
  }
});

const dailySchema = z.object({
  time: z.array(z.string().min(1)).min(1),
  temperature_2m_min: z.array(z.number().finite()).min(1),
  temperature_2m_max: z.array(z.number().finite()).min(1),
}).superRefine((value, context) => {
  const length = value.time.length;
  for (const [key, values] of Object.entries(value)) {
    if (values.length !== length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Daily arrays must have equal lengths.',
        path: [key],
      });
    }
  }
});

export const openMeteoResponseSchema = z.object({
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

function utcIso(timestamp: string): string {
  const explicitZone = /(?:Z|[+-]\d{2}:\d{2})$/u.test(timestamp);
  const date = new Date(explicitZone ? timestamp : `${timestamp}Z`);
  if (!Number.isFinite(date.getTime())) throw new WeatherProviderError('invalid_response');
  return date.toISOString();
}

function mapHourly(raw: OpenMeteoResponse['hourly']) {
  return raw.time.map((time, index) => ({
    temperatureCelsius: raw.temperature_2m[index],
    apparentTemperatureCelsius: raw.apparent_temperature[index],
    condition: mapOpenMeteoWeatherCode(raw.weather_code[index]),
    precipitationProbability: raw.precipitation_probability[index] / 100,
    windSpeedMetersPerSecond: raw.wind_speed_10m[index],
    humidity: raw.relative_humidity_2m[index] / 100,
    uvIndex: raw.uv_index[index],
    forecastAt: utcIso(time),
  })).sort((left, right) => left.forecastAt.localeCompare(right.forecastAt));
}

export function mapOpenMeteoResponse(
  raw: OpenMeteoResponse,
  location: ProviderLocation,
  fetchedAt: string,
): ProviderWeatherSnapshot {
  const observedAt = utcIso(raw.current.time);
  const currentLocalDay = weatherLocalDateKey(observedAt, location.timeZone);
  if (currentLocalDay === null) throw new WeatherProviderError('invalid_response');

  const allHourly = mapHourly(raw.hourly);
  const nearest = allHourly.reduce((best, entry) => (
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
  const hourly = allHourly.filter(({ forecastAt }) => (
    weatherLocalDateKey(forecastAt, location.timeZone) === currentLocalDay
  )).slice(0, 25);
  if (hourly.length === 0) throw new WeatherProviderError('invalid_response');

  return {
    timeZone: location.timeZone,
    fetchedAt: utcIso(fetchedAt),
    provenance: 'live',
    sourceId: 'open-meteo',
    current,
    minimumTemperatureCelsius: Math.min(
      raw.daily.temperature_2m_min[0],
      current.temperatureCelsius,
    ),
    maximumTemperatureCelsius: Math.max(
      raw.daily.temperature_2m_max[0],
      current.temperatureCelsius,
    ),
    hourly,
  };
}
