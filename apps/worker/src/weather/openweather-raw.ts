import type { WeatherConditionCode } from '@kuyara/contracts';
import { z } from 'zod';

import { isoTimestamp, localDateKey } from './raw-time.ts';
import {
  assembleProviderSnapshot,
  type ProviderDayInput,
  type ProviderHour,
  type ProviderHourInput,
} from './provider-snapshot.ts';
import type { ProviderLocation, ProviderWeatherSnapshot } from './weather-provider.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

const finiteNumberSchema = z.number();
const nonNegativeSchema = finiteNumberSchema.min(0);
const percentageSchema = finiteNumberSchema.min(0).max(100);
const probabilitySchema = finiteNumberSchema.min(0).max(1);
const conditionSchema = z.object({ id: z.number().int() });
const conditionsSchema = z.array(conditionSchema).min(1);

const currentSchema = z.object({
  dt: finiteNumberSchema,
  temp: finiteNumberSchema,
  feels_like: finiteNumberSchema,
  humidity: percentageSchema,
  uvi: nonNegativeSchema,
  wind_speed: nonNegativeSchema,
  weather: conditionsSchema,
});

const hourlySchema = z.object({
  dt: finiteNumberSchema,
  temp: finiteNumberSchema,
  feels_like: finiteNumberSchema,
  humidity: percentageSchema,
  uvi: nonNegativeSchema,
  wind_speed: nonNegativeSchema,
  pop: probabilitySchema,
  weather: conditionsSchema,
});

// One Call answers with more days than the daily block uses, so everything the block reads is
// optional here and required in the mapper for the used days alone: one malformed day beyond
// the window must not fail the whole response. `rain` and `snow` are millimetres and One Call
// omits whichever did not fall.
const dailySchema = z.object({
  dt: finiteNumberSchema.optional(),
  temp: z.object({
    min: finiteNumberSchema,
    max: finiteNumberSchema,
  }),
  pop: probabilitySchema.optional(),
  rain: nonNegativeSchema.optional(),
  snow: nonNegativeSchema.optional(),
  weather: conditionsSchema.optional(),
});

export const openWeatherResponseSchema = z.object({
  current: currentSchema,
  hourly: z.array(hourlySchema),
  daily: z.array(dailySchema).min(1),
});

export type OpenWeatherResponse = z.infer<typeof openWeatherResponseSchema>;

/**
 * OpenWeather documents 2xx and 3xx as semantically uniform groups
 * ("Group 2xx: Thunderstorm", "Group 3xx: Drizzle"), so those are matched as
 * ranges and an undocumented member of the group still maps correctly. The 5xx,
 * 6xx and 7xx groups are NOT uniform (5xx mixes rain, heavy rain and freezing
 * rain; 7xx mixes fog-like conditions with squall and tornado), so those are
 * enumerated deliberately. Do not widen them into ranges. Any id outside the
 * table fails rather than defaulting to a condition.
 */
export function mapOpenWeatherCondition(id: number): WeatherConditionCode {
  if (id >= 200 && id <= 232) return 'thunderstorm';
  if (id >= 300 && id <= 321) return 'drizzle';
  if (id === 500 || id === 501 || id === 520 || id === 521) return 'rain';
  if ((id >= 502 && id <= 504) || id === 522 || id === 531) return 'heavy_rain';
  if (id === 511 || (id >= 611 && id <= 613) || id === 615 || id === 616) return 'sleet';
  if ((id >= 600 && id <= 602) || (id >= 620 && id <= 622)) return 'snow';
  if ([701, 711, 721, 731, 741, 751, 761, 762].includes(id)) return 'fog';
  if (id === 771 || id === 781) return 'thunderstorm';
  if (id === 800) return 'clear';
  if (id === 801) return 'mostly_clear';
  if (id === 802) return 'partly_cloudy';
  if (id === 803 || id === 804) return 'cloudy';
  throw new WeatherProviderError('invalid_response');
}

function unixSecondsToIso(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  if (!Number.isFinite(date.getTime())) throw new WeatherProviderError('invalid_response');
  return date.toISOString();
}

// Both keys absent is a day with no precipitation reported at all, which stays null rather
// than becoming a zero the provider never sent; either key present is a real measurement.
function precipitationMillimetres(
  rain: number | undefined,
  snow: number | undefined,
): number | null {
  if (rain === undefined && snow === undefined) return null;
  return (rain ?? 0) + (snow ?? 0);
}

function mapHours(raw: OpenWeatherResponse['hourly']): ProviderHourInput[] {
  return raw.map((entry) => {
    const hour: ProviderHour = {
      temperatureCelsius: entry.temp,
      apparentTemperatureCelsius: entry.feels_like,
      condition: mapOpenWeatherCondition(entry.weather[0].id),
      precipitationProbability: entry.pop,
      windSpeedMetersPerSecond: entry.wind_speed,
      humidity: entry.humidity / 100,
      uvIndex: entry.uvi,
      forecastAt: unixSecondsToIso(entry.dt),
    };
    return { forecastAt: hour.forecastAt, read: () => hour };
  });
}

// One Call stamps each daily entry at local midday, so its local date key is the day it
// describes. The card's low and high come from the same entry the daily block starts on.
function mapDays(raw: OpenWeatherResponse['daily'], timeZone: string): ProviderDayInput[] {
  return raw.flatMap((day) => (day.dt === undefined
    ? []
    : [{
      dateKey: localDateKey(unixSecondsToIso(day.dt), timeZone),
      read: () => {
        if (day.pop === undefined || day.weather === undefined) {
          throw new WeatherProviderError('invalid_response');
        }
        return {
          minimumTemperatureCelsius: day.temp.min,
          maximumTemperatureCelsius: day.temp.max,
          condition: mapOpenWeatherCondition(day.weather[0].id),
          precipitationProbability: day.pop,
          precipitationMillimetres: precipitationMillimetres(day.rain, day.snow),
        };
      },
    }]));
}

export function mapOpenWeatherResponse(
  raw: OpenWeatherResponse,
  location: ProviderLocation,
  fetchedAt: string,
): ProviderWeatherSnapshot {
  return assembleProviderSnapshot({
    sourceId: 'openweather',
    timeZone: location.timeZone,
    fetchedAt: isoTimestamp(fetchedAt),
    observedAt: unixSecondsToIso(raw.current.dt),
    hours: mapHours(raw.hourly),
    days: mapDays(raw.daily, location.timeZone),
    current: (nearest) => ({
      temperatureCelsius: raw.current.temp,
      apparentTemperatureCelsius: raw.current.feels_like,
      condition: mapOpenWeatherCondition(raw.current.weather[0].id),
      precipitationProbability: nearest.precipitationProbability,
      windSpeedMetersPerSecond: raw.current.wind_speed,
      humidity: raw.current.humidity / 100,
      uvIndex: raw.current.uvi,
    }),
  });
}
