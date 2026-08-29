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
} from 'react-native-reanimated';

import { AppText, Surface } from '@/components/ui';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type ProbeLoadingOverlayProps = Readonly<{ label: string }>;

function PulseDot({ index }: Readonly<{ index: number }>) {
  const theme = useKuyaraTheme();
  const progress = useSharedValue(theme.isReduceMotionEnabled ? 1 : 0.45);

  useEffect(() => {
    if (theme.isReduceMotionEnabled) {
      progress.set(1);
      return;
    }

    progress.set(withDelay(
      index * theme.motion.deliberate,
      withRepeat(
        withSequence(
          withTiming(1, { duration: theme.motion.deliberate }),
          withTiming(0.45, { duration: theme.motion.deliberate }),
        ),
        -1,
      ),
    ));

    return () => cancelAnimation(progress);
  }, [index, progress, theme.isReduceMotionEnabled, theme.motion.deliberate]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: 0.8 + progress.get() * 0.2 }],
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: theme.colors.brandAccent },
        animatedStyle,
      ]}
    />
  );
}

export function ProbeLoadingOverlay({ label }: ProbeLoadingOverlayProps) {
  const theme = useKuyaraTheme();

  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityLiveRegion="assertive"
      accessibilityViewIsModal
      style={styles.overlay}
      testID="settings-ai-status-overlay">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]} />
      <Surface style={styles.card} variant="elevated">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.dots}>
          <PulseDot index={0} />
          <PulseDot index={1} />
          <PulseDot index={2} />
        </View>
        <AppText style={styles.label} variant="bodyStrong">
          {label}
        </AppText>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  card: {
    alignItems: 'center',
    gap: spacing.md,
    margin: spacing.lg,
    padding: spacing.xl,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  label: {
    textAlign: 'center',
  },
});
