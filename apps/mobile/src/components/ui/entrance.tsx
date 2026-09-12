import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 7, "content arrives, navigation does not": a screen's content enters in reading
// order, staggered by `motion.stagger`, after the platform's transition has landed.
// The travel is spatial motion, so it rides `springs.spatial`; the fade is effects
// motion on `motion.fast`. The offset is a spacing step rather than a motion distance
// of its own: the piece starts one rhythm unit below where it belongs. The stagger is
// capped at `motion.deliberate`, the longest single transition the language allows: a
// later item in a long list still arrives as part of one arrival rather than a queue.
const ENTRANCE_OFFSET = spacing.md;

export type EntranceProps = Readonly<{
  children: ReactNode;
  /** Position in reading order; each step waits one `motion.stagger` longer. */
  index?: number;
}>;

/**
 * Animates its children in once, on mount. A re-render, a refresh or a data update
 * never replays the entrance, and under Reduce Motion the children are rendered at
 * their resting state with no animation at all. The wrapper carries no accessibility
 * props, so it adds no node a screen reader stops on.
 */
export function Entrance({ children, index = 0 }: EntranceProps) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue<number>(0);
  const offset = useSharedValue<number>(ENTRANCE_OFFSET);
  const hasEntered = useRef(false);

  useEffect(() => {
    if (hasEntered.current || theme.isReduceMotionEnabled) return;
    hasEntered.current = true;

    const delay = Math.min(index * theme.motion.stagger, theme.motion.deliberate);
    opacity.set(withDelay(delay, withTiming(1, { duration: theme.motion.fast })));
    offset.set(withDelay(delay, withSpring(0, theme.springs.spatial)));
  }, [
    index,
    offset,
    opacity,
    theme.isReduceMotionEnabled,
    theme.motion.deliberate,
    theme.motion.fast,
    theme.motion.stagger,
    theme.springs.spatial,
  ]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: offset.get() }],
  }));

  if (theme.isReduceMotionEnabled) {
    return <View>{children}</View>;
  }

  return <Animated.View style={entranceStyle}>{children}</Animated.View>;
}
