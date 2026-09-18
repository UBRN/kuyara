import {
  isWeatherConditionCode,
  type NormalizedCoordinates,
  type WeatherConditionCode,
} from '@/features/weather/domain/weather';
import type { AtmosphereState } from '@/theme/theme';

import { solarEventsOf } from './solar-day';

/**
 * Whether the sun is up at a place at an instant. One reading of it feeds the stage tint
 * and the condition glyph together, so the two can never disagree.
 */
export type Daypart = 'day' | 'night';

const conditionFamilies = {
  clear: 'clear',
  mostly_clear: 'clear',
  partly_cloudy: 'veiled',
  cloudy: 'veiled',
  fog: 'veiled',
  drizzle: 'falling',
  rain: 'falling',
  heavy_rain: 'falling',
  sleet: 'falling',
  snow: 'falling',
  thunderstorm: 'falling',
} as const satisfies Record<WeatherConditionCode, 'clear' | 'veiled' | 'falling'>;

const atmosphereByDaypart = {
  day: {
    clear: 'clearDay',
    veiled: 'veiledDay',
    falling: 'fallingDay',
  },
  night: {
    clear: 'clearNight',
    veiled: 'veiledNight',
    falling: 'fallingNight',
  },
} as const satisfies Readonly<
  Record<'day' | 'night', Readonly<Record<'clear' | 'veiled' | 'falling', AtmosphereState>>>
>;

/**
 * The number this returns is read as an hour of the day, not shown to anyone, so the fixed
 * 'en' locale and h23 cycle are the point: the device's 12-hour setting would fold the
 * evening back onto the morning and send the daypart to night at noon.
 */
export function localHourOf(fetchedAt: string, timeZone: string): number | null {
  const timestamp = Date.parse(fetchedAt);
  if (!Number.isFinite(timestamp)) return null;

  try {
    const parts = new Intl.DateTimeFormat('en', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).formatToParts(timestamp);
    const hour = Number(parts.find(({ type }) => type === 'hour')?.value);
    return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
  } catch {
    return null;
  }
}

/**
 * The daypart at a place at an instant, from the sun's own crossing of the horizon rather
 * than from a fixed pair of clock hours. Coordinates are stored to two decimals, which is
 * about a kilometre and a few seconds of sunrise: far inside what a glyph can say.
 *
 * Returns `null` only when the instant or the time zone is unreadable, which is the same
 * answer the two resolvers below already treat as "draw the neutral thing".
 */
export function resolveDaypart(
  atIso: string,
  timeZone: string,
  coordinates: NormalizedCoordinates | null | undefined,
): Daypart | null {
  const localHour = localHourOf(atIso, timeZone);
  if (localHour === null) return null;

  if (coordinates) {
    const instantMs = Date.parse(atIso);
    const events = solarEventsOf(
      coordinates.latitudeE2 / 100,
      coordinates.longitudeE2 / 100,
      instantMs,
    );
    if (events === 'polar_day') return 'day';
    if (events === 'polar_night') return 'night';
    if (events) {
      return instantMs >= events.sunriseMs && instantMs < events.sunsetMs ? 'day' : 'night';
    }
  }

  // The window the app used before it could compute a horizon, kept for the one case where
  // it still cannot: a place with no coordinates.
  return localHour >= 6 && localHour < 20 ? 'day' : 'night';
}

export function resolveAtmosphereState(
  condition: string,
  daypart: Daypart | null,
): AtmosphereState {
  if (!isWeatherConditionCode(condition) || daypart === null) return 'neutral';

  return atmosphereByDaypart[daypart][conditionFamilies[condition]];
}
