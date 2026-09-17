import {
  isWeatherConditionCode,
  type WeatherConditionCode,
} from '@/features/weather/domain/weather';
import type { ConditionInkRole } from '@/theme/theme';

export type ConditionGlyphShape =
  | 'conditionClear'
  | 'conditionClearNight'
  | 'conditionMostlyClear'
  | 'conditionPartlyCloudy'
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

const styleByCondition = {
  mostly_clear: { ink: 'overcast', shape: 'conditionMostlyClear' },
  partly_cloudy: { ink: 'overcast', shape: 'conditionPartlyCloudy' },
  cloudy: { ink: 'overcast', shape: 'conditionCloudy' },
  fog: { ink: 'fog', shape: 'conditionFog' },
  drizzle: { ink: 'rain', shape: 'conditionDrizzle' },
  rain: { ink: 'rain', shape: 'conditionRain' },
  heavy_rain: { ink: 'rain', shape: 'conditionHeavyRain' },
  sleet: { ink: 'snow', shape: 'conditionSleet' },
  snow: { ink: 'snow', shape: 'conditionSnow' },
  thunderstorm: { ink: 'storm', shape: 'conditionThunderstorm' },
} as const satisfies Readonly<
  Record<Exclude<WeatherConditionCode, 'clear'>, ConditionStyle>
>;

const neutralStyle = Object.freeze({
  ink: 'neutral',
  shape: 'conditionCloudy',
} as const satisfies ConditionStyle);

export function resolveConditionStyle(
  condition: string,
  localHour: number | null,
): ConditionStyle {
  if (
    !isWeatherConditionCode(condition)
    || localHour === null
    || !Number.isInteger(localHour)
    || localHour < 0
    || localHour > 23
  ) {
    return neutralStyle;
  }

  if (condition === 'clear') {
    return localHour >= 6 && localHour < 20
      ? { ink: 'clearDay', shape: 'conditionClear' }
      : { ink: 'clearNight', shape: 'conditionClearNight' };
  }

  return styleByCondition[condition];
}
