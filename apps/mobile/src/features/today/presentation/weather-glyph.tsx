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

import type { AmbientIntensity } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const BOB_OFFSET = 2;
const DROP_TRAVEL = 13;
// The cloud's bob is the ambient cycle itself; the rain is derived from it so the whole
// glyph keeps one tempo. A drop falls in 11/30 of a bob leg and the three drops are
// offset by 7/30 of it, the ratios the 1500 ms calm step already produced at 550 ms and
// 350 ms.
const DROP_CYCLE_RATIO = 11 / 30;
const DROP_STAGGER_RATIO = 7 / 30;

function useBobOffset(isReduceMotionEnabled: boolean, cycleMs: number) {
  const offset = useSharedValue(0);

  useEffect(() => {
    if (isReduceMotionEnabled) {
      offset.set(0);
      return;
    }

    offset.set(
      withRepeat(
        withSequence(
          withTiming(-BOB_OFFSET, { duration: cycleMs }),
          withTiming(0, { duration: cycleMs }),
        ),
        -1,
      ),
    );

    return () => cancelAnimation(offset);
  }, [cycleMs, isReduceMotionEnabled, offset]);

  return offset;
}

function useDropProgress(isReduceMotionEnabled: boolean, index: number, cycleMs: number) {
  const progress = useSharedValue(isReduceMotionEnabled ? 0 : 1);

  useEffect(() => {
    if (isReduceMotionEnabled) {
      progress.set(0);
      return;
    }

    progress.set(
      withDelay(
        cycleMs * DROP_STAGGER_RATIO * index,
        withRepeat(withTiming(1, { duration: cycleMs * DROP_CYCLE_RATIO }), -1),
      ),
    );

    return () => cancelAnimation(progress);
  }, [cycleMs, index, isReduceMotionEnabled, progress]);

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

export function WeatherGlyph({
  intensity = 'calm',
  testID = 'weather-glyph',
}: Readonly<{ intensity?: AmbientIntensity; testID?: string }>) {
  const theme = useKuyaraTheme();
  const cycleMs = theme.motion.ambient[intensity];
  const bobOffset = useBobOffset(theme.isReduceMotionEnabled, cycleMs);
  const dropProgress0 = useDropProgress(theme.isReduceMotionEnabled, 0, cycleMs);
  const dropProgress1 = useDropProgress(theme.isReduceMotionEnabled, 1, cycleMs);
  const dropProgress2 = useDropProgress(theme.isReduceMotionEnabled, 2, cycleMs);
  const cloudColor = theme.colors.textPrimary;
  const dropColor = theme.colors.textPrimary;

  return (
    <View style={styles.container} testID={testID}>
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
