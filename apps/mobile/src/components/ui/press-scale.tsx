import { useState } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type PressableStateCallbackType,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useKuyaraTheme } from '@/theme/theme-context';

// Law 7's press feedback role: a pressed surface scales down and back with
// `motion.fast`. The value is the law's, and it lives here so no feature file
// authors a scale. Under Reduce Motion the surface never leaves its resting 1.
const PRESSED_SCALE = 0.97;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * `Pressable` with Law 7's press response. The pressed state is tracked here rather
 * than read from `Pressable`'s render callback, so `style` and `children` keep their
 * function form and every existing pressed style, ripple and opacity survives: motion
 * layers on top of the visible state and is never the only indication of it.
 */
export function PressScale({
  children,
  onPressIn,
  onPressOut,
  style,
  ...rest
}: PressableProps) {
  const theme = useKuyaraTheme();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const animateTo = (value: number) => {
    scale.set(
      withTiming(theme.isReduceMotionEnabled ? 1 : value, {
        duration: theme.motion.fast,
      }),
    );
  };

  // `hovered` belongs to the web target; on iOS and Android it is always false.
  const state: PressableStateCallbackType = { hovered: false, pressed };

  return (
    <AnimatedPressable
      onPressIn={(event: GestureResponderEvent) => {
        setPressed(true);
        animateTo(PRESSED_SCALE);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        setPressed(false);
        animateTo(1);
        onPressOut?.(event);
      }}
      style={[typeof style === 'function' ? style(state) : style, scaleStyle]}
      {...rest}>
      {typeof children === 'function' ? children(state) : children}
    </AnimatedPressable>
  );
}
