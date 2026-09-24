import { useEffect } from 'react';
import {
  cancelAnimation,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useKuyaraTheme } from '@/theme/theme-context';

/** The trough of one breath. The crest is 1, so a consumer scales the whole range. */
export const AMBIENT_PULSE_FLOOR = 0.45;

/**
 * Law 7's ambient role. An unresolved wait is not a transition, so it breathes on the
 * moderate step: one leg up and one leg down make a 2000 ms breath, the cycle band Ding
 * and Kyung (Journal of Consumer Research 2026) measured as the shortest perceived wait,
 * where the calm step's 3000 ms breath reads slower than it is. It resolves to a still
 * value. `index` starts a consumer one leg after the one before it,
 * so several of them read as one breath travelling. A consumer that wants a quieter
 * breath scales the returned value rather than changing the range.
 */
export function useAmbientPulse(index = 0): SharedValue<number> {
  const theme = useKuyaraTheme();
  const progress = useSharedValue(AMBIENT_PULSE_FLOOR);

  useEffect(() => {
    const leg = theme.motion.ambient.moderate;

    progress.set(withDelay(
      index * leg,
      withRepeat(
        withSequence(
          withTiming(1, { duration: leg }),
          withTiming(AMBIENT_PULSE_FLOOR, { duration: leg }),
        ),
        -1,
      ),
    ));

    return () => cancelAnimation(progress);
  }, [index, progress, theme.motion.ambient.moderate]);

  return progress;
}
