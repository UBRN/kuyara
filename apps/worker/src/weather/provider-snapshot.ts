import {
  isValidWeatherHourlyForecastWindow,
  isWeatherHourlyForecastInWindow,
  weatherDailyForecastMaximumEntries,
  weatherHourlyForecastMaximumEntries,
  type WeatherSourceId,
} from '@kuyara/contracts';

import { localDateKey } from './raw-time.ts';
import type {
  ProviderDailyForecast,
  ProviderWeatherMeasurements,
  ProviderWeatherSnapshot,
} from './weather-provider.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

export type ProviderHour = ProviderWeatherMeasurements & Readonly<{ forecastAt: string }>;

/** An hour whose values are read only when the snapshot uses it. */
export type ProviderHourInput = Readonly<{ forecastAt: string; read: () => ProviderHour }>;

export type ProviderDayValues = Pick<
  ProviderDailyForecast,
  | 'minimumTemperatureCelsius'
  | 'maximumTemperatureCelsius'
  | 'condition'
  | 'precipitationProbability'
  | 'precipitationMillimetres'
>;

/** A day whose values are read only when the snapshot uses it. */
export type ProviderDayInput = Readonly<{ dateKey: string; read: () => ProviderDayValues }>;

export type ProviderSnapshotInput = Readonly<{
  sourceId: WeatherSourceId;
  timeZone: string;
  /** UTC ISO. */
  fetchedAt: string;
  /** UTC ISO. */
  observedAt: string;
  hours: readonly ProviderHourInput[];
  days: readonly ProviderDayInput[];
  /** The current reading; the nearest hour supplies what the provider's current block lacks. */
  current: (nearest: ProviderHour) => ProviderWeatherMeasurements;
}>;

/**
 * The snapshot rules every provider shares: the hour nearest the observation, the hourly
 * window and its cap, today's row widened around the current reading, and the daily slice.
 */
export function assembleProviderSnapshot(input: ProviderSnapshotInput): ProviderWeatherSnapshot {
  const { observedAt } = input;
  const observedMilliseconds = Date.parse(observedAt);
  const allHours = [...input.hours]
    .sort((left, right) => left.forecastAt.localeCompare(right.forecastAt));
  if (allHours.length === 0) throw new WeatherProviderError('invalid_response');
  const nearest = allHours.reduce((best, entry) => (
    Math.abs(Date.parse(entry.forecastAt) - observedMilliseconds)
      < Math.abs(Date.parse(best.forecastAt) - observedMilliseconds)
      ? entry
      : best
  ));
  const current = { ...input.current(nearest.read()), observedAt };

  const hourly = allHours
    .filter(({ forecastAt }) => isWeatherHourlyForecastInWindow(forecastAt, observedAt))
    .slice(0, weatherHourlyForecastMaximumEntries)
    .map((hour) => hour.read());
  if (!isValidWeatherHourlyForecastWindow(hourly, observedAt)) {
    throw new WeatherProviderError('invalid_response');
  }

  const days = [...input.days].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  const currentLocalDay = localDateKey(observedAt, input.timeZone);
  const todayIndex = days.findIndex(({ dateKey }) => dateKey === currentLocalDay);
  if (todayIndex < 0) throw new WeatherProviderError('invalid_response');

  const today = days[todayIndex].read();
  const minimumTemperatureCelsius = Math.min(
    today.minimumTemperatureCelsius,
    current.temperatureCelsius,
  );
  const maximumTemperatureCelsius = Math.max(
    today.maximumTemperatureCelsius,
    current.temperatureCelsius,
  );
  const daily: ProviderDailyForecast[] = days
    .slice(todayIndex, todayIndex + weatherDailyForecastMaximumEntries)
    .map((day, index) => {
      const values = index === 0 ? today : day.read();
      return {
        dateKey: day.dateKey,
        ...values,
        // Today's row is the card's own low and high, clamped around the current reading, so the
        // two never contradict each other on screen.
        ...(index === 0 ? { minimumTemperatureCelsius, maximumTemperatureCelsius } : {}),
      };
    });

  return {
    timeZone: input.timeZone,
    fetchedAt: input.fetchedAt,
    provenance: 'live',
    sourceId: input.sourceId,
    current,
    minimumTemperatureCelsius,
    maximumTemperatureCelsius,
    hourly,
    daily,
  };
}
