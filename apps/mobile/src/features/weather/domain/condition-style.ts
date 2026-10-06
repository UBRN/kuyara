import type { Daypart } from './atmosphere-state';
import {
  isWeatherConditionCode,
  type WeatherConditionCode,
} from '@/features/weather/domain/weather';
import type { ConditionInkRole } from '@/theme/theme';

export type ConditionGlyphShape =
  | 'conditionClear'
  | 'conditionClearNight'
  | 'conditionMostlyClear'
  | 'conditionMostlyClearNight'
  | 'conditionPartlyCloudy'
  | 'conditionPartlyCloudyNight'
  | 'conditionCloudy'
  | 'conditionFog'
  | 'conditionDrizzle'
  | 'conditionRain'
  | 'conditionHeavyRain'
  | 'conditionSleet'
  | 'conditionSnow'
  | 'conditionThunderstorm';

export type ConditionStyle = Readonly<{
  ink: ConditionInkRole;
  shape: ConditionGlyphShape;
}>;

/**
 * The shape and ink each condition wears while the sun is up. Every code is here; the
 * three that can show the sky itself are overridden below after sunset.
 */
const dayStyleByCondition = {
  clear: { ink: 'clearDay', shape: 'conditionClear' },
  mostly_clear: { ink: 'mostlyClearDay', shape: 'conditionMostlyClear' },
  partly_cloudy: { ink: 'partlyCloudyDay', shape: 'conditionPartlyCloudy' },
  cloudy: { ink: 'cloudy', shape: 'conditionCloudy' },
  fog: { ink: 'fog', shape: 'conditionFog' },
  drizzle: { ink: 'drizzle', shape: 'conditionDrizzle' },
  rain: { ink: 'rain', shape: 'conditionRain' },
  heavy_rain: { ink: 'heavyRain', shape: 'conditionHeavyRain' },
  sleet: { ink: 'sleet', shape: 'conditionSleet' },
  snow: { ink: 'snow', shape: 'conditionSnow' },
  thunderstorm: { ink: 'thunderstorm', shape: 'conditionThunderstorm' },
} as const satisfies Readonly<Record<WeatherConditionCode, ConditionStyle>>;

/**
 * Only the three conditions that can show the sky itself change after sunset. A cloud, a
 * fog bank or a rain shower looks the same at either hour, so giving it a second form
 * would encode nothing and only add a symbol to keep in step across two platforms.
 */
const nightStyleByCondition: Readonly<
  Partial<Record<WeatherConditionCode, ConditionStyle>>
> = {
  clear: { ink: 'clearNight', shape: 'conditionClearNight' },
  mostly_clear: { ink: 'mostlyClearNight', shape: 'conditionMostlyClearNight' },
  partly_cloudy: { ink: 'partlyCloudyNight', shape: 'conditionPartlyCloudyNight' },
};

const neutralStyle = Object.freeze({
  ink: 'neutral',
  shape: 'conditionCloudy',
} as const satisfies ConditionStyle);

export function resolveConditionStyle(
  condition: string,
  daypart: Daypart | null,
): ConditionStyle {
  if (!isWeatherConditionCode(condition) || daypart === null) return neutralStyle;

  const night = daypart === 'night' ? nightStyleByCondition[condition] : undefined;
  return night ?? dayStyleByCondition[condition];
}

/**
 * ADR 0020's closed vocabulary for the condition symbol, on Today and on Weather alike: the
 * sun turns, clouds drift, what comes down falls. A night sky and an unknown condition hold
 * still.
 */
export type ConditionSymbolMotion = 'turn' | 'drift' | 'fall' | 'still';

const motionByShape: Readonly<Record<ConditionGlyphShape, ConditionSymbolMotion>> = {
  conditionClear: 'turn',
  conditionMostlyClear: 'turn',
  conditionClearNight: 'still',
  conditionMostlyClearNight: 'still',
  conditionPartlyCloudy: 'drift',
  conditionPartlyCloudyNight: 'drift',
  conditionCloudy: 'drift',
  conditionFog: 'drift',
  conditionDrizzle: 'fall',
  conditionRain: 'fall',
  conditionHeavyRain: 'fall',
  conditionSleet: 'fall',
  conditionSnow: 'fall',
  conditionThunderstorm: 'fall',
};

export function conditionSymbolMotion(conditionStyle: ConditionStyle): ConditionSymbolMotion {
  return conditionStyle.ink === 'neutral' ? 'still' : motionByShape[conditionStyle.shape];
}
