import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useKuyaraTheme } from '@/theme/theme-context';

export type ProgressFillProps = Readonly<{
  /** How much of the track is filled, 0 to 1. Values outside the range are clamped. */
  progress: number;
  /** The track's geometry: height, radius and how it shares its row. */
  style?: StyleProp<ViewStyle>;
}>;

/**
 * A track that fills to `progress`. The fill travels on `motion.deliberate`, the longest
 * single transition the language allows, because it reports a step the user just
 * completed; under Reduce Motion it arrives at its new width with no travel. The
 * component carries no accessibility props: the progress it draws is already announced by
 * whatever owns the step, so it adds no node a screen reader stops on.
 */
export function ProgressFill({ progress, style }: ProgressFillProps) {
  const theme = useKuyaraTheme();
  const target = Math.min(1, Math.max(0, progress));
  const filled = useSharedValue(target);

  useEffect(() => {
    filled.set(
      theme.isReduceMotionEnabled
        ? target
        : withTiming(target, { duration: theme.motion.deliberate }),
    );
  }, [filled, target, theme.isReduceMotionEnabled, theme.motion.deliberate]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${filled.get() * 100}%` }));

  return (
    <View style={[styles.track, { backgroundColor: theme.colors.borderSubtle }, style]}>
      <Animated.View
        style={[styles.fill, { backgroundColor: theme.colors.brandPrimary }, fillStyle]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    overflow: 'hidden',
  },
  fill: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
});
