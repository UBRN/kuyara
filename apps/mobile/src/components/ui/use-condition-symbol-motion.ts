import { useCallback } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useWhileVisible } from '@/components/ui/use-screen-visible';

// ADR 0020's closed vocabulary for the condition symbol: the sun turns, clouds drift, what
// comes down falls, and a symbol that holds still draws no motion. The feature owns which
// condition wears which.
export type SymbolMotion = 'turn' | 'drift' | 'fall' | 'still';

// The sun's eight rays repeat every 45 degrees, so one leg turns it by 45 and the restart is
// invisible; a drift or a fall travels about a point and a half and comes back.
const TURN_DEGREES = 45;
const DRIFT_TRAVEL = 1.3;
const FALL_TRAVEL = 1.5;

/**
 * The animated style of a condition symbol. Each leg of its loop is `legMs`, the ambient
 * step the condition's intensity selects, so its tempo follows the weather.
 */
export function useConditionSymbolMotion(motion: SymbolMotion, legMs: number) {
  const progress = useSharedValue(0);

  useWhileVisible(useCallback(() => {
    if (motion === 'still') return undefined;
    progress.set(motion === 'turn'
      ? withRepeat(withTiming(1, { duration: legMs, easing: Easing.linear }), -1, false)
      : withRepeat(withTiming(1, { duration: legMs }), -1, true));
    return () => {
      cancelAnimation(progress);
      progress.set(0);
    };
  }, [legMs, motion, progress]));

  return useAnimatedStyle(() => {
    const value = progress.get();
    if (motion === 'turn') return { transform: [{ rotate: `${value * TURN_DEGREES}deg` }] };
    if (motion === 'drift') return { transform: [{ translateX: value * DRIFT_TRAVEL }] };
    return { transform: [{ translateY: value * FALL_TRAVEL }] };
  });
}
