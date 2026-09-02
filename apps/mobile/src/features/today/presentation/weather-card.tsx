import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Surface } from '@/components/ui';
import type { LocalizedHourlyRainProbability } from '@/features/today/presentation/today-presentation';
import { useLocalization } from '@/localization/use-messages';
import { withAlpha } from '@/theme/color-alpha';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const weatherAttributionUrls: Readonly<Record<string, string>> = {
  'open-meteo': 'https://open-meteo.com/',
  openweather: 'https://openweathermap.org/',
};

export type WeatherCardStat = Readonly<{
  label: string;
  value: string;
}>;

export type WeatherCardRainTimeline = Readonly<{
  heading: string;
  hours: readonly LocalizedHourlyRainProbability[];
  accessibilityLabel: string;
}>;

type WeatherCardProps = Readonly<{
  rainProbability: string;
  stats: readonly WeatherCardStat[];
  metricsAccessibilityLabel: string;
  rainTimeline?: WeatherCardRainTimeline;
  sourceId?: string;
  testID?: string;
}>;

const RAIN_BAR_MAX_HEIGHT = 34;
const RAIN_BAR_SIGNIFICANT_THRESHOLD = 40;
export const RAIN_BAR_MUTED_ALPHA = 0.7;
export const CARD_BACKGROUND_ALPHA = 0.08;

export function WeatherCard({
  rainProbability,
  stats,
  metricsAccessibilityLabel,
  rainTimeline,
  sourceId,
  testID,
}: WeatherCardProps) {
  const theme = useKuyaraTheme();
  const { messages } = useLocalization();
  const attributionLabel = sourceId === 'open-meteo'
    ? messages.weather.attributionOpenMeteo
    : sourceId === 'openweather'
      ? messages.weather.attributionOpenWeather
      : null;
  const significantBarColor = theme.colors.brandAccent;
  const mutedBarColor = withAlpha(theme.colors.brandAccent, RAIN_BAR_MUTED_ALPHA);

  return (
    <Surface
      style={[styles.card, { backgroundColor: withAlpha(theme.colors.brandAccent, CARD_BACKGROUND_ALPHA) }]}
      testID={testID}
      variant="elevated">
      <View
        accessible
        accessibilityLabel={metricsAccessibilityLabel}
        style={styles.statsRow}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <AppText colorRole="textSecondary" variant="eyebrow">
              {stat.label}
            </AppText>
            <AppText variant="label">
              {stat.value}
            </AppText>
          </View>
        ))}
      </View>

      {rainTimeline ? (
        <View
          accessible
          accessibilityLabel={rainTimeline.accessibilityLabel}
          style={[styles.timeline, { borderTopColor: theme.colors.borderSubtle }]}>
          <AppText colorRole="textSecondary" variant="eyebrow">
            {rainTimeline.heading}
          </AppText>
          <View style={styles.bars}>
            {rainTimeline.hours.map((hour) => (
              <View key={hour.label} style={styles.barColumn}>
                <View
                  style={[
                    styles.bar,
                    {
                      backgroundColor:
                        hour.probabilityPercent >= RAIN_BAR_SIGNIFICANT_THRESHOLD
                          ? significantBarColor
                          : mutedBarColor,
                      height: Math.max(
                        4,
                        (hour.probabilityPercent / 100) * RAIN_BAR_MAX_HEIGHT,
                      ),
                    },
                  ]}
                />
                <AppText colorRole="textSecondary" variant="caption">
                  {hour.label}
                </AppText>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <AppText colorRole="textSecondary">{rainProbability}</AppText>
        </View>
      )}

      {attributionLabel && sourceId && (
        <Pressable
          accessibilityRole="link"
          hitSlop={13}
          onPress={() => { void Linking.openURL(weatherAttributionUrls[sourceId]); }}
          style={styles.attribution}>
          <AppText colorRole="textSecondary" variant="caption">
            {attributionLabel}
          </AppText>
        </Pressable>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  attribution: {
    alignSelf: 'flex-start',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    rowGap: spacing.md,
  },
  stat: {
    gap: spacing.xs,
  },
  timeline: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  bars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: RAIN_BAR_MAX_HEIGHT + 20,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
  },
  bar: {
    borderRadius: 2,
    width: '100%',
  },
});
