import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { FadeIn, fadeTo } from '@/components/ui';
import { useKuyaraTheme } from '@/theme/theme-context';

/** Content that fades in when it is replaced (effects motion), and stays still on mount. */
export function FadeOnChange({ animate, children }: Readonly<{ animate: boolean; children: ReactNode }>) {
  const theme = useKuyaraTheme();
  // A piece row draws this over its full-row pressable, so the fade itself never takes a touch.
  return <FadeIn animate={animate} duration={theme.motion.normal} pointerEvents="box-none">{children}</FadeIn>;
}

/** A leaving worn control: whole in its first frame, gone on `fast`, then out of the tree. */
export function FadeOut({ onDone, children }: Readonly<{ onDone: () => void; children: ReactNode }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(fadeTo(0, theme.motion.fast, theme.motion, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(onDone);
    }));
  }, [onDone, opacity, theme.motion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}>
      {children}
    </Animated.View>
  );
}
