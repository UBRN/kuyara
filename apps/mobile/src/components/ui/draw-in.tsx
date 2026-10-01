import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useKuyaraTheme } from '@/theme/theme-context';

// Law 7, extended to a chart: its data marks draw in once, after the card that holds them
// has faded in, so the eye follows the day's curve and lands on its warmest point. Drawing
// is spatial motion and rides `springs.spatial`; the marks start one `motion.fast` after
// the card's own arrival and later marks wait one `motion.stagger` each. Only the marks
// move: every number and label beside them is drawn from the start.

type DrawInTiming = Readonly<{
  /**
   * Read once, on mount: false renders the marks at rest and never animates them, so data
   * that was already on screen (a cached open, a refresh) does not redraw.
   */
  play: boolean;
  /** Holds the marks at the start until it turns false, as `Entrance` does. */
  waiting?: boolean;
  /** Position in reading order; each step waits one `motion.stagger` longer. */
  index?: number;
}>;

function useDrawIn({ play, waiting = false, index = 0 }: DrawInTiming) {
  const theme = useKuyaraTheme();
  const progress = useSharedValue<number>(play ? 0 : 1);
  const started = useRef(!play);
  // Once drawn, React holds the resting style itself, as `Entrance` does.
  const [drawn, setDrawn] = useState(!play);

  useEffect(() => {
    if (started.current || waiting) return;
    started.current = true;
    const delay = theme.motion.fast + index * theme.motion.stagger;
    progress.set(withDelay(delay, withSpring(1, theme.springs.spatial, (finished) => {
      if (finished) scheduleOnRN(setDrawn, true);
    })));
  }, [index, progress, theme.motion.fast, theme.motion.stagger, theme.springs.spatial, waiting]);

  return { drawn, progress };
}

export type DrawRevealProps = DrawInTiming & Readonly<{
  children: ReactNode;
  /** The marks' full width; the reveal never uncovers past it. */
  width: number;
  /** How far the reveal travels while it draws: the visible part of a wider series. */
  span: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

/**
 * Uncovers its children from the start edge, the way a line is drawn. Two opposed
 * translations clip without resizing anything, so the reveal stays on the UI thread.
 */
export function DrawReveal({ children, width, span, style, testID, ...timing }: DrawRevealProps) {
  const { drawn, progress } = useDrawIn(timing);
  const clip = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.min(width, progress.get() * span) - width }],
  }));
  const counter = useAnimatedStyle(() => ({
    transform: [{ translateX: width - Math.min(width, progress.get() * span) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[style, styles.clip, { width }, drawn ? undefined : clip]}
      testID={testID}>
      <Animated.View style={drawn ? undefined : counter}>{children}</Animated.View>
    </Animated.View>
  );
}

export type DrawGrowProps = DrawInTiming & Readonly<{
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

/** A bar that grows from its start edge to its full length. It has no children. */
export function DrawGrow({ style, testID, ...timing }: DrawGrowProps) {
  const { drawn, progress } = useDrawIn(timing);
  const grow = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.get() }] }));
  return (
    <Animated.View
      style={[style, styles.growOrigin, drawn ? undefined : grow]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  growOrigin: { transformOrigin: 'left' },
});
