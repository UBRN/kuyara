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

const finiteNumberSchema = z.number().finite();
const nonNegativeSchema = finiteNumberSchema.min(0);
const probabilitySchema = finiteNumberSchema.min(0).max(1);
const timestampSchema = z.string().datetime({ offset: true });

const currentWeatherSchema = z.object({
  asOf: timestampSchema,
  conditionCode: z.string().min(1),
  humidity: probabilitySchema,
  temperature: finiteNumberSchema,
  temperatureApparent: finiteNumberSchema,
  uvIndex: z.number().int().min(0),
  windSpeed: nonNegativeSchema,
}).passthrough();

const hourlyWeatherSchema = z.object({
  forecastStart: timestampSchema,
  conditionCode: z.string().min(1),
  humidity: probabilitySchema,
  precipitationChance: probabilitySchema,
  temperature: finiteNumberSchema,
  temperatureApparent: finiteNumberSchema,
  uvIndex: z.number().int().min(0),
  windSpeed: nonNegativeSchema,
}).passthrough();

const dailyWeatherSchema = z.object({
  forecastStart: timestampSchema,
  temperatureMax: finiteNumberSchema,
  temperatureMin: finiteNumberSchema,
}).passthrough();

export const weatherKitResponseSchema = z.object({
  currentWeather: currentWeatherSchema,
  forecastHourly: z.object({
    hours: z.array(hourlyWeatherSchema).min(1),
  }).passthrough(),
  forecastDaily: z.object({
    days: z.array(dailyWeatherSchema).min(1),
  }).passthrough(),
}).passthrough();

export type WeatherKitResponse = z.infer<typeof weatherKitResponseSchema>;

const conditions = new Map<string, WeatherConditionCode>([
  ['clear', 'clear'],
  ['mostlyClear', 'mostly_clear'],
  ['partlyCloudy', 'partly_cloudy'],
  ['cloudy', 'cloudy'],
  ['mostlyCloudy', 'cloudy'],
  ['foggy', 'fog'],
  ['haze', 'fog'],
  ['smoky', 'fog'],
  ['blowingDust', 'fog'],
  ['drizzle', 'drizzle'],
  ['freezingDrizzle', 'drizzle'],
  ['sunShowers', 'drizzle'],
  ['rain', 'rain'],
  ['freezingRain', 'rain'],
  ['heavyRain', 'heavy_rain'],
  ['hurricane', 'heavy_rain'],
  ['tropicalStorm', 'heavy_rain'],
  ['sleet', 'sleet'],
  ['hail', 'sleet'],
  ['wintryMix', 'sleet'],
  ['snow', 'snow'],
  ['heavySnow', 'snow'],
  ['blizzard', 'snow'],
  ['flurries', 'snow'],
  ['blowingSnow', 'snow'],
  ['sunFlurries', 'snow'],
  ['thunderstorms', 'thunderstorm'],
  ['isolatedThunderstorms', 'thunderstorm'],
  ['scatteredThunderstorms', 'thunderstorm'],
  ['strongStorms', 'thunderstorm'],
  ['breezy', 'clear'],
  ['windy', 'clear'],
  ['hot', 'clear'],
  ['frigid', 'clear'],
]);

export function mapWeatherKitCondition(conditionCode: string): WeatherConditionCode {
  const condition = conditions.get(conditionCode);
  if (condition === undefined) throw new WeatherProviderError('invalid_response');
  return condition;
}

function isoTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new WeatherProviderError('invalid_response');
  return date.toISOString();
}

function mapHourly(raw: WeatherKitResponse['forecastHourly']['hours']) {
  return raw.map((entry) => ({
    temperatureCelsius: entry.temperature,
    apparentTemperatureCelsius: entry.temperatureApparent,
    condition: mapWeatherKitCondition(entry.conditionCode),
    precipitationProbability: entry.precipitationChance,
    windSpeedMetersPerSecond: entry.windSpeed / 3.6,
    humidity: entry.humidity,
    uvIndex: entry.uvIndex,
    forecastAt: isoTimestamp(entry.forecastStart),
  })).sort((left, right) => left.forecastAt.localeCompare(right.forecastAt));
}

export function mapWeatherKitResponse(
  raw: WeatherKitResponse,
  location: ProviderLocation,
  fetchedAt: string,
): ProviderWeatherSnapshot {
  const observedAt = isoTimestamp(raw.currentWeather.asOf);
  const currentLocalDay = weatherLocalDateKey(observedAt, location.timeZone);
  if (currentLocalDay === null) throw new WeatherProviderError('invalid_response');

  const allHourly = mapHourly(raw.forecastHourly.hours);
  const nearest = allHourly.reduce((best, entry) => (
    Math.abs(Date.parse(entry.forecastAt) - Date.parse(observedAt))
      < Math.abs(Date.parse(best.forecastAt) - Date.parse(observedAt))
      ? entry
      : best
  ));
  const current: ProviderWeatherMeasurements & Readonly<{ observedAt: string }> = {
    temperatureCelsius: raw.currentWeather.temperature,
    apparentTemperatureCelsius: raw.currentWeather.temperatureApparent,
    condition: mapWeatherKitCondition(raw.currentWeather.conditionCode),
    precipitationProbability: nearest.precipitationProbability,
    windSpeedMetersPerSecond: raw.currentWeather.windSpeed / 3.6,
    humidity: raw.currentWeather.humidity,
    uvIndex: raw.currentWeather.uvIndex,
    observedAt,
  };
  const hourly = allHourly.filter(({ forecastAt }) => (
    weatherLocalDateKey(forecastAt, location.timeZone) === currentLocalDay
  )).slice(0, 25);
  if (
    hourly.length === 0 ||
    hourly.some(({ forecastAt }, index) => (
      index > 0 && hourly[index - 1].forecastAt >= forecastAt
    ))
  ) {
    throw new WeatherProviderError('invalid_response');
  }

  const daily = raw.forecastDaily.days.find(({ forecastStart }) => (
    weatherLocalDateKey(isoTimestamp(forecastStart), location.timeZone) === currentLocalDay
  ));
  if (daily === undefined) throw new WeatherProviderError('invalid_response');

  return {
    timeZone: location.timeZone,
    fetchedAt: isoTimestamp(fetchedAt),
    provenance: 'live',
    sourceId: 'weatherkit',
    current,
    minimumTemperatureCelsius: Math.min(daily.temperatureMin, current.temperatureCelsius),
    maximumTemperatureCelsius: Math.max(daily.temperatureMax, current.temperatureCelsius),
    hourly,
  };
}
