import { weatherLocalDateKey } from '@kuyara/contracts';

import { resolveDaypart } from '@/features/weather/domain/atmosphere-state';
import type { HourlyWeather, NormalizedCoordinates, WeatherSnapshot } from '@/features/weather/domain/weather';
import type { TemperatureUnit } from '@/localization/device-locale';
import type { AppMessages, SupportedLanguage } from '@/localization/messages';
import { formatClockTime } from '@/presentation/format-clock-time';
import { formatTemperature, formatTemperatureValue } from '@/presentation/format-temperature';

import type { HourlyRailColumn, HourlyTimeEmphasis } from './hourly-rail';
import { remainingHourlyForecast } from './remaining-hours';
import { percentage, weekday } from './weather-format';

export type HourlyColumnWording = Readonly<{
  language: SupportedLanguage;
  hour12: boolean;
  temperatureUnit: TemperatureUnit;
  copy: AppMessages['weather'];
  /** The spoken name of the temperature unit, read into each column's label. */
  unitName: string;
}>;

/**
 * Whether the hour at `index` is the first one of a new local day in `timeZone`. The first
 * column never is: it has nothing before it to change from.
 */
export function startsNewLocalDay(
  hours: readonly HourlyWeather[],
  index: number,
  timeZone: string,
): boolean {
  return index > 0
    && weatherLocalDateKey(hours[index].forecastAt, timeZone)
      !== weatherLocalDateKey(hours[index - 1].forecastAt, timeZone);
}

/**
 * O14 rail A: the first remaining hour is the current one and says "Now", and the first
 * hour of a later local day names the day instead of the clock (midnight reads "Sun").
 */
export function hourlyTimeEmphasis(index: number, newLocalDay: boolean): HourlyTimeEmphasis | undefined {
  if (index === 0) return 'now';
  return newLocalDay ? 'newDay' : undefined;
}

/**
 * The rail's columns: every hour of the snapshot not yet ended at `now`, read in the
 * place's own time zone. Built from frozen inputs only, so the screen can keep them while
 * only its refresh state changes.
 */
export function hourlyRailColumns(
  snapshot: WeatherSnapshot,
  now: number,
  coordinates: NormalizedCoordinates | undefined,
  wording: HourlyColumnWording,
): readonly HourlyRailColumn[] {
  const { copy, hour12, language, temperatureUnit, unitName } = wording;
  const { timeZone } = snapshot;
  const hours = remainingHourlyForecast(snapshot.hourly, now);
  return hours.map((hour, index): HourlyRailColumn => {
    const newLocalDay = startsNewLocalDay(hours, index, timeZone);
    const timeEmphasis = hourlyTimeEmphasis(index, newLocalDay);
    const clockTime = formatClockTime(hour.forecastAt, language, hour12, timeZone);
    return {
      key: hour.forecastAt,
      // The spoken label keeps the clock time even where the column shows "Now" or a day.
      accessibilityLabel: copy.hourlyForecastAccessibilityLabel({
        day: newLocalDay ? weekday(hour.forecastAt, timeZone, language, 'long') : undefined,
        time: clockTime,
        unitName,
        temperature: formatTemperatureValue(hour.temperatureCelsius, language, temperatureUnit),
        condition: copy.conditions[hour.condition],
        precipitationProbability: hour.precipitationProbability,
      }),
      condition: hour.condition,
      daypart: resolveDaypart(hour.forecastAt, timeZone, coordinates),
      precipitationProbability: hour.precipitationProbability,
      precipitation: percentage(hour.precipitationProbability, language),
      temperature: formatTemperature(hour.temperatureCelsius, language, temperatureUnit),
      temperatureCelsius: hour.temperatureCelsius,
      time: timeEmphasis === 'now'
        ? copy.hourlyNow
        : timeEmphasis === 'newDay'
          ? weekday(hour.forecastAt, timeZone, language, 'short')
          : clockTime,
      timeEmphasis,
    };
  });
}
