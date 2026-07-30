import { Platform, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type ScreenProps = Omit<ScrollViewProps, 'contentInset'>;

export function Screen({
  children,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
  style,
  ...rest
}: ScreenProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useKuyaraTheme();
  const bottomInset = safeAreaInsets.bottom + spacing.lg;
  const scrollIndicatorInsets =
    Platform.OS === 'ios' ? { ...safeAreaInsets, bottom: bottomInset } : undefined;
  const platformContentStyle = Platform.select({
    ios: {
      paddingTop: safeAreaInsets.top,
      paddingBottom: bottomInset,
      paddingLeft: safeAreaInsets.left + spacing.xl,
      paddingRight: safeAreaInsets.right + spacing.xl,
    },
    android: {
      paddingTop: safeAreaInsets.top,
      paddingBottom: bottomInset,
      paddingLeft: safeAreaInsets.left + spacing.xl,
      paddingRight: safeAreaInsets.right + spacing.xl,
    },
    web: {
      paddingTop: spacing['2xl'],
      paddingBottom: spacing.xl,
    },
  });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      scrollIndicatorInsets={scrollIndicatorInsets}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      style={[styles.screen, { backgroundColor: theme.colors.background }, style]}
      contentContainerStyle={[styles.content, platformContentStyle, contentContainerStyle]}
      {...rest}>
      {children}
    </ScrollView>
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
    paddingHorizontal: spacing.xl,
  },
});
