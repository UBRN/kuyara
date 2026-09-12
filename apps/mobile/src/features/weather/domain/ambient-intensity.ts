import type { WeatherConditionCode } from '@/features/weather/domain/weather';

// The tempo the weather asks for. The theme declares the same three steps as motion
// tokens; the domain names them without depending on the theme, and the two are kept in
// step by ambient-intensity.test.mjs.
export type AmbientIntensity = 'calm' | 'moderate' | 'intense';

// The ambient tempo of a condition: how fast the weather itself is moving, not how bad
// it is. Anything that only sits in the sky is calm; drizzle falls slowly; everything
// that actually comes down falls fast. The map is total over the condition vocabulary,
// so a new condition is a type error rather than a silent calm.
const intensityByCondition = {
  clear: 'calm',
  mostly_clear: 'calm',
  partly_cloudy: 'calm',
  cloudy: 'calm',
  fog: 'calm',
  drizzle: 'moderate',
  rain: 'intense',
  heavy_rain: 'intense',
  sleet: 'intense',
  snow: 'intense',
  thunderstorm: 'intense',
} as const satisfies Readonly<Record<WeatherConditionCode, AmbientIntensity>>;

export function ambientIntensityOf(condition: WeatherConditionCode): AmbientIntensity {
  return intensityByCondition[condition];
}
