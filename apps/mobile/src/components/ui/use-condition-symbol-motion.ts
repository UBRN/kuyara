import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { ConditionStyle } from '@/features/today/domain/condition-style';

// ADR 0020's closed vocabulary for the condition symbol, on Today and on Weather alike: the
// sun turns, clouds drift, what comes down falls. A night sky and an unknown condition hold
// still.
type SymbolMotion = 'turn' | 'drift' | 'fall' | 'still';

const motionByShape: Readonly<Record<ConditionStyle['shape'], SymbolMotion>> = {
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

// The sun's eight rays repeat every 45 degrees, so one leg turns it by 45 and the restart is
// invisible; a drift or a fall travels about a point and a half and comes back.
const TURN_DEGREES = 45;
const DRIFT_TRAVEL = 1.3;
const FALL_TRAVEL = 1.5;

/**
 * The animated style of a condition symbol. Each leg of its loop is `legMs`, the ambient
 * step the condition's intensity selects, so its tempo follows the weather.
 */
export function useConditionSymbolMotion(conditionStyle: ConditionStyle, legMs: number) {
  const motion = conditionStyle.ink === 'neutral' ? 'still' : motionByShape[conditionStyle.shape];
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.set(0);
    if (motion === 'still') return undefined;
    progress.set(motion === 'turn'
      ? withRepeat(withTiming(1, { duration: legMs, easing: Easing.linear }), -1, false)
      : withRepeat(withTiming(1, { duration: legMs }), -1, true));
    return () => cancelAnimation(progress);
  }, [legMs, motion, progress]);

  return useAnimatedStyle(() => {
    const value = progress.get();
    if (motion === 'turn') return { transform: [{ rotate: `${value * TURN_DEGREES}deg` }] };
    if (motion === 'drift') return { transform: [{ translateX: value * DRIFT_TRAVEL }] };
    return { transform: [{ translateY: value * FALL_TRAVEL }] };
  });
}
