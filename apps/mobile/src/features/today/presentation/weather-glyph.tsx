import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useKuyaraTheme } from '@/theme/theme-context';

const BOB_DURATION_MS = 1500;
const BOB_OFFSET = 2;
const DROP_DURATION_MS = 550;
const DROP_STAGGER_MS = 350;
const DROP_TRAVEL = 13;

function useBobOffset(isReduceMotionEnabled: boolean) {
  const offset = useSharedValue(0);

  useEffect(() => {
    if (isReduceMotionEnabled) {
      offset.set(0);
      return;
    }

    offset.set(
      withRepeat(
        withSequence(
          withTiming(-BOB_OFFSET, { duration: BOB_DURATION_MS }),
          withTiming(0, { duration: BOB_DURATION_MS }),
        ),
        -1,
      ),
    );

    return () => cancelAnimation(offset);
  }, [isReduceMotionEnabled, offset]);

  return offset;
}

function useDropProgress(isReduceMotionEnabled: boolean, index: number) {
  const progress = useSharedValue(isReduceMotionEnabled ? 0 : 1);

  useEffect(() => {
    if (isReduceMotionEnabled) {
      progress.set(0);
      return;
    }

    progress.set(
      withDelay(
        DROP_STAGGER_MS * index,
        withRepeat(withTiming(1, { duration: DROP_DURATION_MS }), -1),
      ),
    );

    return () => cancelAnimation(progress);
  }, [index, isReduceMotionEnabled, progress]);

  return progress;
}

function CloudLobe({
  offset,
  style,
}: Readonly<{ offset: SharedValue<number>; style: object }>) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
  }));

  return <Animated.View style={[styles.lobe, style, animatedStyle]} />;
}

function RainDrop({
  progress,
  color,
  left,
}: Readonly<{
  progress: SharedValue<number>;
  color: string;
  left: number;
}>) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get() < 0.3 ? progress.get() / 0.3 : 1 - (progress.get() - 0.3) / 0.7,
    transform: [{ translateY: -2 + progress.get() * DROP_TRAVEL }],
  }));

  return (
    <Animated.View
      style={[styles.drop, { backgroundColor: color, left }, animatedStyle]}
    />
  );
}

export function WeatherGlyph() {
  const theme = useKuyaraTheme();
  const bobOffset = useBobOffset(theme.isReduceMotionEnabled);
  const dropProgress0 = useDropProgress(theme.isReduceMotionEnabled, 0);
  const dropProgress1 = useDropProgress(theme.isReduceMotionEnabled, 1);
  const dropProgress2 = useDropProgress(theme.isReduceMotionEnabled, 2);
  const cloudColor = theme.colors.brandAccent;
  const dropColor = theme.colors.textPrimary;

  return (
    <View style={styles.container} testID="weather-glyph">
      <CloudLobe offset={bobOffset} style={{ backgroundColor: cloudColor, left: 2, top: 4, width: 22, height: 14 }} />
      <CloudLobe offset={bobOffset} style={{ backgroundColor: cloudColor, left: 10, top: 0, width: 14, height: 14 }} />
      <RainDrop progress={dropProgress0} color={dropColor} left={7} />
      <RainDrop progress={dropProgress1} color={dropColor} left={14} />
      <RainDrop progress={dropProgress2} color={dropColor} left={21} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 26,
    width: 36,
  },
  lobe: {
    borderRadius: 9,
    position: 'absolute',
  },
  drop: {
    borderRadius: 1,
    height: 6,
    position: 'absolute',
    top: 17,
    width: 1.5,
  },
});
