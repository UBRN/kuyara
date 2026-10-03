import { useEffect, type ReactNode } from 'react';
import { type LayoutChangeEvent, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import type { MotionTokens } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/** Law 7's single effects curve, shared by arriving and leaving content. */
export function fadeEasing(motion: MotionTokens) {
  return Easing.bezier(...motion.fadeCurve);
}

export function fadeTo(
  value: number,
  duration: number,
  motion: MotionTokens,
  callback?: Parameters<typeof withTiming>[2],
) {
  const config = { duration, easing: fadeEasing(motion) };
  return callback ? withTiming(value, config, callback) : withTiming(value, config);
}

export function FadeIn({
  animate = true,
  children,
  delay = 0,
  duration,
  onLayout,
  pointerEvents,
  style,
}: Readonly<{
  animate?: boolean;
  children: ReactNode;
  delay?: number;
  duration: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  pointerEvents?: ViewProps['pointerEvents'];
  style?: StyleProp<ViewStyle>;
}>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    const arrival = fadeTo(1, duration, theme.motion);
    opacity.set(delay ? withDelay(delay, arrival) : arrival);
  }, [animate, delay, duration, opacity, theme.motion]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View onLayout={onLayout} pointerEvents={pointerEvents} style={[style, fade]}>{children}</Animated.View>;
}
