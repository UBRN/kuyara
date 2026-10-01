import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useKuyaraTheme } from '@/theme/theme-context';

export type PlateRect = Readonly<{ x: number; y: number; width: number; height: number }>;

export type ShrinkingPlateProps = Readonly<{
  /** The plane's size when it starts, filling its parent from the top left. */
  from: Readonly<{ width: number; height: number }>;
  fromColor: string;
  /** The rectangle it shrinks into, in its parent's coordinates. */
  to: PlateRect;
  toColor: string;
  toRadius: number;
  testID?: string;
}>;

/**
 * A plane that shrinks once, on mount, from filling its parent into one rectangle and takes
 * that rectangle's colour and corner radius: the first-generation runway's field becoming
 * Today's stage plate, ADR 0020's one exception to the still stage. The size is spatial
 * motion on `springs.spatial`; the colour is effects motion on `motion.normal`. It is
 * childless and absolutely placed, so animating its frame lays nothing else out.
 */
export function ShrinkingPlate({ from, fromColor, to, toColor, toRadius, testID }: ShrinkingPlateProps) {
  const theme = useKuyaraTheme();
  const shrink = useSharedValue(0);
  const tint = useSharedValue(0);

  useEffect(() => {
    shrink.set(withSpring(1, theme.springs.spatial));
    tint.set(withTiming(1, { duration: theme.motion.normal }));
    return () => {
      cancelAnimation(shrink);
      cancelAnimation(tint);
    };
  }, [shrink, theme.motion.normal, theme.springs.spatial, tint]);

  const style = useAnimatedStyle(() => {
    const shrunk = shrink.get();
    return {
      backgroundColor: interpolateColor(tint.get(), [0, 1], [fromColor, toColor]),
      borderRadius: toRadius * shrunk,
      height: from.height + (to.height - from.height) * shrunk,
      left: to.x * shrunk,
      top: to.y * shrunk,
      width: from.width + (to.width - from.width) * shrunk,
    };
  });

  return <Animated.View pointerEvents="none" style={[styles.plate, style]} testID={testID} />;
}

const styles = StyleSheet.create({
  plate: { position: 'absolute' },
});
