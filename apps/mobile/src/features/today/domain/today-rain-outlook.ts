import { weatherLocalDateKey } from '@kuyara/contracts';

import type { WeatherSnapshot } from '@/features/weather/domain/weather';

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

/**
 * Today's highest rain chance, including current conditions and only hourly entries
 * that still overlap the current local day.
 */
export function todayRainOutlookProbability(
  weather: WeatherSnapshot,
  now: number,
): number {
  // The local day is the one `now` falls in, not the snapshot's: just after midnight a
  // snapshot observed yesterday must not filter out every hour of the new day.
  const currentLocalDate = Number.isFinite(now)
    ? weatherLocalDateKey(new Date(now).toISOString(), weather.timeZone)
    : null;

  return weather.hourly.reduce((highest, hour) => {
    const forecastAt = Date.parse(hour.forecastAt);
    const isRemainingToday = Number.isFinite(forecastAt) &&
      forecastAt + HOUR_IN_MILLISECONDS > now &&
      currentLocalDate !== null &&
      weatherLocalDateKey(hour.forecastAt, weather.timeZone) === currentLocalDate;

    return isRemainingToday
      ? Math.max(highest, hour.precipitationProbability)
      : highest;
  }, weather.current.precipitationProbability);
}
