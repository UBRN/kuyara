import { useCallback, useMemo, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { thereAndBack } from '@/components/ui/there-and-back';
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

// A drift or a fall comes back on the quadratic ease in and out of each leg.
const driftOrFall = thereAndBack(Easing.inOut(Easing.quad));

/**
 * The animated style of a condition symbol, for React Native's `Animated.View`. Each leg of
 * its loop is `legMs`, the ambient step the condition's intensity selects, so its tempo
 * follows the weather. The loop runs on the native driver: a Reanimated loop commits the
 * shadow tree on every frame, which relays and walks the whole window while the screen is idle.
 */
export function useConditionSymbolMotion(motion: SymbolMotion, legMs: number) {
  const [progress] = useState(() => new Animated.Value(0));

  useWhileVisible(useCallback(() => {
    if (motion === 'still') return undefined;
    const loop = Animated.loop(Animated.timing(progress, motion === 'turn'
      ? { duration: legMs, easing: Easing.linear, toValue: 1, useNativeDriver: true }
      : { duration: 2 * legMs, easing: driftOrFall, toValue: 1, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      progress.setValue(0);
    };
  }, [legMs, motion, progress]));

  return useMemo(() => {
    if (motion === 'turn') {
      return { transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${TURN_DEGREES}deg`] }) }] };
    }
    if (motion === 'drift') return { transform: [{ translateX: Animated.multiply(progress, DRIFT_TRAVEL) }] };
    return { transform: [{ translateY: Animated.multiply(progress, FALL_TRAVEL) }] };
  }, [motion, progress]);
}
