import { Platform, StyleSheet } from 'react-native';
import Animated, { type AnimatedScrollViewProps } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type ScreenProps = Omit<AnimatedScrollViewProps, 'contentInset'> &
  Readonly<{
    /**
     * Total space to reserve above the content, measured from the top of the
     * screen and including the top safe area. Pass the measured height of an
     * absolute overlay header. Omit it when the content starts below the safe
     * area with no overlay.
     */
    contentTopClearance?: number;
  }>;

export function Screen({
  children,
  contentContainerStyle,
  contentTopClearance,
  showsVerticalScrollIndicator = false,
  style,
  ...rest
}: ScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useKuyaraTheme();
  const bottomInset = safeAreaInsets.bottom + spacing.md;
  const scrollIndicatorInsets =
    Platform.OS === 'ios' ? { ...safeAreaInsets, bottom: bottomInset } : undefined;
  // iOS resolves the top safe area itself through contentInsetAdjustmentBehavior,
  // which is also what UIRefreshControl measures its pull against. Android has no
  // equivalent, so the same clearance is applied as padding there.
  const requestedClearance = contentTopClearance ?? safeAreaInsets.top;
  const paddingTop =
    Platform.OS === 'ios'
      ? Math.max(requestedClearance - safeAreaInsets.top, 0)
      : requestedClearance;
  const platformContentStyle = Platform.select({
    ios: {
      paddingTop,
      paddingBottom: bottomInset,
      paddingLeft: safeAreaInsets.left + spacing.lg,
      paddingRight: safeAreaInsets.right + spacing.lg,
    },
    android: {
      paddingTop,
      paddingBottom: bottomInset,
      paddingLeft: safeAreaInsets.left + spacing.lg,
      paddingRight: safeAreaInsets.right + spacing.lg,
    },
    web: {
      paddingTop: spacing.lg,
      paddingBottom: spacing['2xl'],
    },
  });

  return (
    <Animated.ScrollView
      contentInsetAdjustmentBehavior="automatic"
      scrollIndicatorInsets={scrollIndicatorInsets}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      style={[styles.screen, { backgroundColor: theme.colors.background }, style]}
      contentContainerStyle={[styles.content, platformContentStyle, contentContainerStyle]}
      {...rest}>
      {children}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
});
