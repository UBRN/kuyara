import type { WeatherSnapshot } from '@/features/weather/domain/weather';
import { forecastHourHasNotEnded, wardrobeDayWindow } from '@/features/weather/domain/wardrobe-day';

/**
 * The highest rain chance ahead, including current conditions and only hourly entries that
 * still overlap the dressing day: the rest of the calendar day until local midnight, and the
 * hours through 04:00 once the evening has begun.
 */
export function todayRainOutlookProbability(
  weather: WeatherSnapshot,
  now: number,
): number {
  // The window is the one `now` falls in, not the snapshot's: just after midnight a
  // snapshot observed yesterday must not filter out every hour still ahead.
  const dayWindow = Number.isFinite(now)
    ? wardrobeDayWindow(new Date(now).toISOString(), weather.timeZone)
    : null;
  const windowEnd = dayWindow ? Date.parse(dayWindow.end) : Number.NaN;

  return weather.hourly.reduce((highest, hour) => {
    const forecastAt = Date.parse(hour.forecastAt);
    const isRemainingToday = Number.isFinite(forecastAt) &&
      forecastHourHasNotEnded(forecastAt, now) &&
      forecastAt < windowEnd;

    return isRemainingToday
      ? Math.max(highest, hour.precipitationProbability)
      : highest;
  }, weather.current.precipitationProbability);
}
