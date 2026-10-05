import type { WeatherConditionCode } from '@kuyara/contracts';
import { z } from 'zod';

import { isoTimestamp, localDateKey } from './raw-time.ts';
import {
  assembleProviderSnapshot,
  type ProviderDayInput,
  type ProviderHourInput,
} from './provider-snapshot.ts';
import type { ProviderLocation, ProviderWeatherSnapshot } from './weather-provider.ts';
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
  ['freezingDrizzle', 'sleet'],
  ['sunShowers', 'drizzle'],
  ['rain', 'rain'],
  ['freezingRain', 'sleet'],
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

// The values, including the condition code, are read only for the hours the snapshot serves.
function mapHours(raw: WeatherKitResponse['forecastHourly']['hours']): ProviderHourInput[] {
  return raw.map((entry) => {
    const forecastAt = isoTimestamp(entry.forecastStart);
    return {
      forecastAt,
      read: () => ({
        temperatureCelsius: entry.temperature,
        apparentTemperatureCelsius: entry.temperatureApparent,
        condition: mapWeatherKitCondition(entry.conditionCode),
        precipitationProbability: entry.precipitationChance,
        windSpeedMetersPerSecond: entry.windSpeed / 3.6,
        humidity: entry.humidity,
        uvIndex: entry.uvIndex,
        forecastAt,
      }),
    };
  });
}

function mapDays(
  raw: WeatherKitResponse['forecastDaily']['days'],
  timeZone: string,
): ProviderDayInput[] {
  return raw.map((day) => ({
    dateKey: localDateKey(isoTimestamp(day.forecastStart), timeZone),
    read: () => {
      if (day.conditionCode === undefined || day.precipitationChance === undefined) {
        throw new WeatherProviderError('invalid_response');
      }
      return {
        minimumTemperatureCelsius: day.temperatureMin,
        maximumTemperatureCelsius: day.temperatureMax,
        condition: mapWeatherKitCondition(day.conditionCode),
        precipitationProbability: day.precipitationChance,
        precipitationMillimetres: day.precipitationAmount ?? null,
      };
    },
  }));
}

export function mapWeatherKitResponse(
  raw: WeatherKitResponse,
  location: ProviderLocation,
  fetchedAt: string,
): ProviderWeatherSnapshot {
  return assembleProviderSnapshot({
    sourceId: 'weatherkit',
    timeZone: location.timeZone,
    fetchedAt: isoTimestamp(fetchedAt),
    observedAt: isoTimestamp(raw.currentWeather.asOf),
    hours: mapHours(raw.forecastHourly.hours),
    days: mapDays(raw.forecastDaily.days, location.timeZone),
    current: (nearest) => ({
      temperatureCelsius: raw.currentWeather.temperature,
      apparentTemperatureCelsius: raw.currentWeather.temperatureApparent,
      condition: mapWeatherKitCondition(raw.currentWeather.conditionCode),
      precipitationProbability: nearest.precipitationProbability,
      windSpeedMetersPerSecond: raw.currentWeather.windSpeed / 3.6,
      humidity: raw.currentWeather.humidity,
      uvIndex: raw.currentWeather.uvIndex,
    }),
  });
}
