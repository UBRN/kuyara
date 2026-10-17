import { useCallback, useMemo, useState } from 'react';
import { Animated, Easing } from 'react-native';

import { thereAndBack } from '@/components/ui/there-and-back';
import { useKuyaraTheme } from '@/theme/theme-context';
import { useWhileVisible } from '@/components/ui/use-screen-visible';

/** The trough of one breath. The crest is 1, so a consumer scales the whole range. */
export const AMBIENT_PULSE_FLOOR = 0.45;

const breath = thereAndBack(Easing.inOut(Easing.quad));

/**
 * Law 7's ambient role. An unresolved wait is not a transition, so it breathes on the
 * moderate step: one leg up and one leg down make a 2000 ms breath, the cycle band Ding
 * and Kyung (Journal of Consumer Research 2026) measured as the shortest perceived wait,
 * where the calm step's 3000 ms breath reads slower than it is. It resolves to a still
 * value. `index` starts a consumer one leg after the one before it,
 * so several of them read as one breath travelling. A consumer that wants a quieter
 * breath scales the returned value rather than changing the range. The value drives React
 * Native's `Animated.View` on the native driver, so a breath never commits the shadow tree.
 */
export function useAmbientPulse(index = 0): Animated.AnimatedInterpolation<number> {
  const theme = useKuyaraTheme();
  const [progress] = useState(() => new Animated.Value(0));
  const leg = theme.motion.ambient.moderate;

  useWhileVisible(useCallback(() => {
    const loop = Animated.loop(Animated.timing(progress, {
      delay: index * leg,
      duration: 2 * leg,
      easing: breath,
      toValue: 1,
      useNativeDriver: true,
    }));
    loop.start();
    return () => {
      loop.stop();
      progress.setValue(0);
    };
  }, [index, leg, progress]));

  return useMemo(
    () => progress.interpolate({ inputRange: [0, 1], outputRange: [AMBIENT_PULSE_FLOOR, 1] }),
    [progress],
  );
}
