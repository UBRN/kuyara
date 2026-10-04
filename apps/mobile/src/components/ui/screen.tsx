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
    /**
     * Grow the content container to the scroll view's frame so `justifyContent` can
     * centre or bottom-align short content. Off by default: the frame includes the
     * area under the tab bar, so a filled container leaves slack above the bar when
     * the content is scrolled to its end.
     */
    fill?: boolean;
  }>;

/**
 * The page's side gutters in points: the safe area plus the content inset. A band that
 * reaches both screen edges pulls out by exactly these.
 */
export function useScreenGutters() {
  const { left, right } = useSafeAreaInsets();
  return { left: left + spacing.lg, right: right + spacing.lg };
}

/** The width of a band that reaches both screen edges from content `contentWidth` wide. */
export function useBandWidth(contentWidth: number) {
  const { left, right } = useScreenGutters();
  return contentWidth + left + right;
}

export function Screen({
  children,
  contentContainerStyle,
  contentTopClearance,
  fill = false,
  showsVerticalScrollIndicator = false,
  style,
  ...rest
}: ScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const gutters = useScreenGutters();
  const theme = useKuyaraTheme();
  // iOS resolves both safe areas itself through contentInsetAdjustmentBehavior,
  // which is also what UIRefreshControl measures its pull against, and under native
  // tabs that automatic inset already includes the tab bar (ADR 0027 section 4).
  // Adding the safe-area inset again on iOS double-counted the bar. Android has no
  // equivalent, so the same clearance is applied as padding there.
  const bottomInset =
    Platform.OS === 'ios' ? spacing.md : safeAreaInsets.bottom + spacing.md;
  const scrollIndicatorInsets =
    Platform.OS === 'ios' ? { ...safeAreaInsets, bottom: bottomInset } : undefined;
  const requestedClearance = contentTopClearance ?? safeAreaInsets.top;
  const paddingTop =
    Platform.OS === 'ios'
      ? Math.max(requestedClearance - safeAreaInsets.top, 0)
      : requestedClearance;
  const platformContentStyle = Platform.select({
    ios: {
      paddingTop,
      paddingBottom: bottomInset,
      paddingLeft: gutters.left,
      paddingRight: gutters.right,
    },
    android: {
      paddingTop,
      paddingBottom: bottomInset,
      paddingLeft: gutters.left,
      paddingRight: gutters.right,
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
      contentContainerStyle={[
        styles.content,
        fill && styles.fill,
        platformContentStyle,
        contentContainerStyle,
      ]}
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
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
  fill: {
    flexGrow: 1,
  },
});
