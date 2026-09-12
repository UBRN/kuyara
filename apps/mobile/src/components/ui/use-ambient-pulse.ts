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
 * calm step, the one step that depicts no weather, and resolves to a still value under
 * Reduce Motion. `index` starts a consumer one leg after the one before it, so several
 * of them read as one breath travelling. A consumer that wants a quieter breath scales
 * the returned value rather than changing the range.
 */
export function useAmbientPulse(index = 0): SharedValue<number> {
  const theme = useKuyaraTheme();
  const progress = useSharedValue(theme.isReduceMotionEnabled ? 1 : AMBIENT_PULSE_FLOOR);

  useEffect(() => {
    if (theme.isReduceMotionEnabled) {
      progress.set(1);
      return;
    }

    const leg = theme.motion.ambient.calm;

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
  }, [index, progress, theme.isReduceMotionEnabled, theme.motion.ambient.calm]);

  return progress;
}
