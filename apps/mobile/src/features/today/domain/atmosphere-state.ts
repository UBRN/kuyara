import {
  isWeatherConditionCode,
  type WeatherConditionCode,
} from '@/features/weather/domain/weather';
import type { AtmosphereState } from '@/theme/theme';

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

export function resolveAtmosphereState(
  condition: string,
  localHour: number | null,
): AtmosphereState {
  if (
    !isWeatherConditionCode(condition)
    || localHour === null
    || !Number.isInteger(localHour)
  ) {
    return 'neutral';
  }

  if (localHour < 0 || localHour > 23) return 'neutral';
  const family = conditionFamilies[condition];
  return atmosphereByDaypart[localHour >= 6 && localHour < 20 ? 'day' : 'night'][family];
}
