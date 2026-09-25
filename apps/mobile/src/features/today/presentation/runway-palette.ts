import type { Daypart } from '@/features/today/domain/atmosphere-state';
import { resolveConditionStyle } from '@/features/today/domain/condition-style';
import { isWeatherConditionCode, type WeatherConditionCode } from '@/features/weather/domain/weather';
import type { KuyaraTheme, RunwayField } from '@/theme/theme';

// ADR 0020's closed vocabulary, carried into the runway's board band: rain and snow fall,
// cloud drifts as wisps, a clear sky shows slow motes.
export type RunwayParticleKind = 'rain' | 'snow' | 'wisp' | 'mote';

const groupByCondition: Readonly<Record<WeatherConditionCode, RunwayField>> = {
  clear: 'clear',
  mostly_clear: 'clear',
  partly_cloudy: 'cloudy',
  cloudy: 'cloudy',
  fog: 'cloudy',
  drizzle: 'rain',
  rain: 'rain',
  heavy_rain: 'rain',
  sleet: 'rain',
  snow: 'snow',
  thunderstorm: 'rain',
};

const kindByField: Readonly<Record<RunwayField, RunwayParticleKind>> = {
  clear: 'mote',
  cloudy: 'wisp',
  rain: 'rain',
  snow: 'snow',
};

/** The field group a condition wears; an unreadable one takes the quiet cloudy field. */
export function runwayField(condition: string | null): RunwayField {
  return condition !== null && isWeatherConditionCode(condition) ? groupByCondition[condition] : 'cloudy';
}

export function runwayParticleKind(condition: string): RunwayParticleKind | null {
  return isWeatherConditionCode(condition) ? kindByField[groupByCondition[condition]] : null;
}

/**
 * The particles wear their condition's own ink at full strength, flat and opaque: the
 * runway is on Law 4's closed consumer list. A light clear field also carries white motes
 * (`surface`) beside the sun's ink, the sparkle O1 approved.
 */
export function runwayParticleInks(
  theme: KuyaraTheme,
  condition: string,
  daypart: Daypart | null,
): Readonly<{ ink: string; sparkle: string | null }> {
  const ink = theme.condition[resolveConditionStyle(condition, daypart ?? 'day').ink];
  const sparkle = !theme.isDark && runwayField(condition) === 'clear' ? theme.colors.surface : null;
  return { ink, sparkle };
}
