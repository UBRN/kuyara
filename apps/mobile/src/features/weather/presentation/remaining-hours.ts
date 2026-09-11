import type { HourlyWeather } from '@/features/weather/domain/weather';

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

/**
 * The hours the rail still has to say something about: every entry whose hour has not
 * ended at `now`, so the current hour stays and earlier ones drop. The Worker sends the
 * whole local day and the domain consumers filter for themselves; the rail's heading
 * promises the remaining hours, so it filters here at render time, which also keeps a
 * stale snapshot honest.
 */
export function remainingHourlyForecast(
  hourly: readonly HourlyWeather[],
  now: number,
): readonly HourlyWeather[] {
  return hourly.filter(({ forecastAt }) => Date.parse(forecastAt) + HOUR_IN_MILLISECONDS > now);
}
