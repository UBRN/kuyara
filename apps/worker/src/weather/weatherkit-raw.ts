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

const finiteNumberSchema = z.number();
const nonNegativeSchema = finiteNumberSchema.min(0);
const probabilitySchema = finiteNumberSchema.min(0).max(1);
const timestampSchema = z.iso.datetime({ offset: true });

const currentWeatherSchema = z.looseObject({
  asOf: timestampSchema,
  conditionCode: z.string().min(1),
  humidity: probabilitySchema,
  temperature: finiteNumberSchema,
  temperatureApparent: finiteNumberSchema,
  uvIndex: z.number().int().min(0),
  windSpeed: nonNegativeSchema,
});

const hourlyWeatherSchema = z.looseObject({
  forecastStart: timestampSchema,
  conditionCode: z.string().min(1),
  humidity: probabilitySchema,
  precipitationChance: probabilitySchema,
  temperature: finiteNumberSchema,
  temperatureApparent: finiteNumberSchema,
  uvIndex: z.number().int().min(0),
  windSpeed: nonNegativeSchema,
});

// Apple documents `conditionCode`, `precipitationChance` and `precipitationAmount` as required
// on DayWeatherConditions and the amount in millimetres, but it answers with more days than the
// daily block uses. They are optional here and required in the mapper for the used days alone:
// one malformed day beyond the window must never fail the whole response, because WeatherKit is
// the head of the chain and its loss is silent, costs a counted call and would take /v1 with it.
const dailyWeatherSchema = z.looseObject({
  forecastStart: timestampSchema,
  temperatureMax: finiteNumberSchema,
  temperatureMin: finiteNumberSchema,
  conditionCode: z.string().min(1).optional(),
  precipitationChance: probabilitySchema.optional(),
  precipitationAmount: nonNegativeSchema.optional(),
});

export const weatherKitResponseSchema = z.looseObject({
  currentWeather: currentWeatherSchema,
  forecastHourly: z.looseObject({
    hours: z.array(hourlyWeatherSchema).min(1),
  }),
  forecastDaily: z.looseObject({
    days: z.array(dailyWeatherSchema).min(1),
  }),
});

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
  // The REST API returns PascalCase ("MostlyClear") while the Swift WeatherCondition cases
  // this map is keyed by are camelCase; lowering the first character accepts both spellings.
  const condition = conditions.get(
    conditionCode.charAt(0).toLowerCase() + conditionCode.slice(1),
  );
  if (condition === undefined) throw new WeatherProviderError('invalid_response');
  return condition;
}

function isoTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new WeatherProviderError('invalid_response');
  return date.toISOString();
}

function localDateKey(timestamp: string, timeZone: string): string {
  const dateKey = weatherLocalDateKey(timestamp, timeZone);
  if (dateKey === null) throw new WeatherProviderError('invalid_response');
  return dateKey;
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
  const currentLocalDay = localDateKey(observedAt, location.timeZone);

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
    isWeatherHourlyForecastInWindow(forecastAt, observedAt)
  )).slice(0, weatherHourlyForecastMaximumEntries);
  if (!isValidWeatherHourlyForecastWindow(hourly, observedAt)) {
    throw new WeatherProviderError('invalid_response');
  }

  const days = raw.forecastDaily.days
    .map((day) => ({ day, dateKey: localDateKey(isoTimestamp(day.forecastStart), location.timeZone) }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  const todayIndex = days.findIndex(({ dateKey }) => dateKey === currentLocalDay);
  if (todayIndex < 0) throw new WeatherProviderError('invalid_response');

  const minimumTemperatureCelsius = Math.min(
    days[todayIndex].day.temperatureMin,
    current.temperatureCelsius,
  );
  const maximumTemperatureCelsius = Math.max(
    days[todayIndex].day.temperatureMax,
    current.temperatureCelsius,
  );
  const daily: ProviderDailyForecast[] = days
    .slice(todayIndex, todayIndex + weatherDailyForecastMaximumEntries)
    .map(({ day, dateKey }, index) => {
      if (day.conditionCode === undefined || day.precipitationChance === undefined) {
        throw new WeatherProviderError('invalid_response');
      }
      return {
        dateKey,
        condition: mapWeatherKitCondition(day.conditionCode),
        // Today's row is the card's own low and high, clamped around the current reading, so the
        // two never contradict each other on screen.
        minimumTemperatureCelsius: index === 0 ? minimumTemperatureCelsius : day.temperatureMin,
        maximumTemperatureCelsius: index === 0 ? maximumTemperatureCelsius : day.temperatureMax,
        precipitationProbability: day.precipitationChance,
        precipitationMillimetres: day.precipitationAmount ?? null,
      };
    });

  return {
    timeZone: location.timeZone,
    fetchedAt: isoTimestamp(fetchedAt),
    provenance: 'live',
    sourceId: 'weatherkit',
    current,
    minimumTemperatureCelsius,
    maximumTemperatureCelsius,
    hourly,
    daily,
  };
}
