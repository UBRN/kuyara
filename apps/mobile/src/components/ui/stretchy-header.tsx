import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type StretchyHeaderGeometryInput = Readonly<{
  compactHeight: number;
  compactRadius: number;
  offset: number;
  topInset: number;
}>;

type StretchyHeaderGeometry = Readonly<{
  borderRadius: number;
  scaleY: number;
}>;

export function resolveStretchyHeaderGeometry({
  compactHeight,
  compactRadius,
  offset,
  topInset,
}: StretchyHeaderGeometryInput): StretchyHeaderGeometry {
  'worklet';

  if (compactHeight <= 0 || topInset <= 0) {
    return { borderRadius: compactRadius, scaleY: 1 };
  }

  const pullDistance = interpolate(
    offset,
    [-topInset, 0],
    [topInset, 0],
    Extrapolation.CLAMP,
  );

  return {
    borderRadius: interpolate(
      pullDistance,
      [0, topInset],
      [compactRadius, 0],
      Extrapolation.CLAMP,
    ),
    scaleY: 1 + pullDistance / compactHeight,
  };
}

export type StretchyHeaderProps = PropsWithChildren<{
  contentContainerStyle?: StyleProp<ViewStyle>;
  onHeightChange: (height: number) => void;
  scrollOffset: SharedValue<number>;
  testID?: string;
}>;

export function StretchyHeader({
  children,
  contentContainerStyle,
  onHeightChange,
  scrollOffset,
  testID,
}: StretchyHeaderProps) {
  const insets = useSafeAreaInsets();
  const theme = useKuyaraTheme();
  const compactHeight = useSharedValue(0);
  const compactHeightRef = useRef(0);
  const reportedHeightRef = useRef(0);
  const topInset = insets.top;
  const compactRadius = radii.card;

  const reportHeight = useCallback(
    (nextCompactHeight: number) => {
      const nextHeight = nextCompactHeight + insets.top;

      if (nextHeight !== reportedHeightRef.current) {
        reportedHeightRef.current = nextHeight;
        onHeightChange(nextHeight);
      }
    },
    [insets.top, onHeightChange],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextCompactHeight = Math.max(
        event.nativeEvent.layout.height - insets.top,
        0,
      );
      compactHeightRef.current = nextCompactHeight;
      compactHeight.set(nextCompactHeight);
      reportHeight(nextCompactHeight);
    },
    [compactHeight, insets.top, reportHeight],
  );

  useEffect(() => {
    reportHeight(compactHeightRef.current);
  }, [reportHeight]);

  const animatedBackgroundStyle = useAnimatedStyle(() => {
    const geometry = resolveStretchyHeaderGeometry({
      compactHeight: compactHeight.get(),
      compactRadius,
      offset: scrollOffset.get(),
      topInset,
    });

    return {
      borderBottomLeftRadius: geometry.borderRadius,
      borderBottomRightRadius: geometry.borderRadius,
      transform: [{ scaleY: geometry.scaleY }],
    };
  }, [compactRadius, topInset]);

  return (
    <View
      onLayout={handleLayout}
      pointerEvents="box-none"
      style={[styles.header, { paddingTop: insets.top }]}
      testID={testID}>
      <View
        pointerEvents="none"
        style={[
          styles.safeAreaMask,
          {
            backgroundColor: theme.colors.background,
            height: insets.top,
          },
        ]}
        testID={testID ? `${testID}-safe-area-mask` : undefined}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.background,
          {
            backgroundColor: theme.colors.surface,
            top: insets.top,
          },
          animatedBackgroundStyle,
        ]}
        testID={testID ? `${testID}-background` : undefined}
      />
      <View
        pointerEvents="box-none"
        style={[
          styles.content,
          {
            paddingLeft: insets.left + spacing.xl,
            paddingRight: insets.right + spacing.xl,
          },
          contentContainerStyle,
        ]}
        testID={testID ? `${testID}-content` : undefined}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  background: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    transformOrigin: ['50%', '100%', 0],
  },
  safeAreaMask: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  content: {
    alignSelf: 'center',
    maxWidth: layout.maxContentWidth,
    paddingVertical: spacing.lg,
    width: '100%',
  },
});
