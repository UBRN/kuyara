import { resolveConditionStyle } from '@/features/today/domain/condition-style';
import { isWeatherConditionCode, type WeatherConditionCode } from '@/features/weather/domain/weather';
import { blend } from '@/theme/color-blend';
import type { KuyaraTheme } from '@/theme/theme';

// ADR 0020's closed vocabulary, carried into the runway's board band: rain and snow fall,
// cloud drifts as wisps, a clear sky shows slow motes.
export type RunwayParticleKind = 'rain' | 'snow' | 'wisp' | 'mote';

const kindByCondition: Readonly<Record<WeatherConditionCode, RunwayParticleKind>> = {
  clear: 'mote',
  mostly_clear: 'mote',
  partly_cloudy: 'wisp',
  cloudy: 'wisp',
  fog: 'wisp',
  drizzle: 'rain',
  rain: 'rain',
  heavy_rain: 'rain',
  sleet: 'rain',
  snow: 'snow',
  thunderstorm: 'rain',
};

export function runwayParticleKind(condition: string): RunwayParticleKind | null {
  return isWeatherConditionCode(condition) ? kindByCondition[condition] : null;
}

// Particles are derived from the atmosphere, never a new hue. Falling weather leans toward
// its own condition ink. Clear and veiled skies lean toward the appearance's lightest
// semantic value, because every atmosphere is darker than it in both appearances: in light
// that is `surface` (the page ground sits too close to the day planes to be seen), in dark
// `textPrimary` (the dark ground is darker than the stage, which drew charcoal on navy).
// The ratios keep every pairing between the floor and ceiling `runway-palette.test.mjs` measures.
const SKY_TONE = { light: 0.62, dark: 0.28 } as const;
const INK_TONE = 0.42;

export function runwayParticleColor(
  theme: KuyaraTheme,
  plane: string,
  condition: string,
): string {
  const kind = runwayParticleKind(condition);
  // A falling condition wears the same ink at either hour, so the daypart never matters here.
  if (kind === 'rain' || kind === 'snow') {
    return blend(plane, theme.condition[resolveConditionStyle(condition, 'day').ink], INK_TONE);
  }
  const light = theme.isDark ? theme.colors.textPrimary : theme.colors.surface;
  return blend(plane, light, SKY_TONE[theme.colorScheme]);
}
