import { useEffect, useRef, useState, type ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
  /**
   * Holds the children at the start until it turns false: a tab screen mounts before it is
   * shown, and an arrival played then would be over before anyone saw it.
   */
  waiting?: boolean;
}>;

/**
 * Animates its children in once, on mount or when it stops waiting. A re-render, a refresh or a data update
 * never replays the entrance. The wrapper carries no accessibility
 * props, so it adds no node a screen reader stops on.
 */
export function Entrance({ children, index = 0, waiting = false }: EntranceProps) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue<number>(0);
  const offset = useSharedValue<number>(ENTRANCE_OFFSET);
  const hasEntered = useRef(false);
  // Once landed, React holds the resting style itself, so a re-render after Reanimated
  // dropped its settled props (a JS stall 1 to 2 s after the last frame) cannot commit
  // the zero-opacity start again.
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (hasEntered.current || waiting) return;
    hasEntered.current = true;

    const delay = Math.min(index * theme.motion.stagger, theme.motion.deliberate);
    opacity.set(withDelay(delay, withTiming(1, { duration: theme.motion.fast })));
    offset.set(withDelay(delay, withSpring(0, theme.springs.spatial, (finished) => {
      if (finished) scheduleOnRN(setEntered, true);
    })));
  }, [
    index,
    offset,
    opacity,
    theme.motion.deliberate,
    theme.motion.fast,
    theme.motion.stagger,
    theme.springs.spatial,
    waiting,
  ]);

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: offset.get() }],
  }));

  return <Animated.View style={entered ? undefined : entranceStyle}>{children}</Animated.View>;
}
