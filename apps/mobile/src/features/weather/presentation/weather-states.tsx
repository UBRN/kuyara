import { StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, Surface } from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { PlateView } from '@/theme/plate-theme';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/**
 * Weather's loading state, in the Closet's anatomy (ADR 0029 section 4): the screen's own
 * planes fill without content, the empty stage where the current conditions will stand and
 * one plain card below it, and the whole is a single progress element that says so.
 */
export function WeatherLoadingState({ label }: Readonly<{ label: string }>) {
  const theme = useKuyaraTheme();
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessible
      style={styles.loading}
      testID="weather-loading">
      <PlateView color={theme.colors.stage} style={styles.loadingStage} />
      <Surface style={styles.loadingCard} />
    </View>
  );
}

/**
 * Weather's error state, in the Closet's anatomy (ADR 0029 section 4): a `dangerInk` glyph at
 * 20, 8, a `bodyStrong` title, 4, a `body` line in `textSecondary`, 12, the retry button.
 */
export function WeatherErrorState({
  body,
  onRetry,
  retryLabel,
  title,
}: Readonly<{ body: string; onRetry: () => void; retryLabel: string; title: string }>) {
  const theme = useKuyaraTheme();
  // VoiceOver ignores the live region on the line, so iOS also speaks the failure.
  useErrorAnnouncement(`${title}. ${body}`);
  return (
    <View style={styles.error} testID="weather-load-error">
      <Icon color={theme.colors.dangerInk} name="error" size={20} />
      <AppText accessibilityRole="header" style={styles.errorTitle} variant="bodyStrong">
        {title}
      </AppText>
      <AppText accessibilityLiveRegion="polite" colorRole="textSecondary" style={styles.errorBody}>
        {body}
      </AppText>
      <Button label={retryLabel} onPress={onRetry} style={styles.errorRetry} testID="weather-retry-button" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { gap: spacing.md },
  // Placeholder heights near the loaded blocks' own at the default text size, so the screen
  // does not jump far when the forecast arrives.
  loadingStage: { borderRadius: radii.stage, height: 216 },
  loadingCard: { height: 184 },
  error: { alignItems: 'center', paddingVertical: spacing.lg },
  // Precise per-gap margins rather than a uniform container gap, because the three gaps
  // are not equal.
  errorTitle: { marginTop: spacing.sm, textAlign: 'center' },
  errorBody: { marginTop: spacing.xs, textAlign: 'center' },
  errorRetry: { marginTop: spacing.md },
});
