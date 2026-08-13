import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/ui';
import { WeatherGlyph } from '@/features/today/presentation/weather-glyph';
import type { LocalizedHourlyRainProbability } from '@/features/today/presentation/today-presentation';
import { withAlpha } from '@/theme/color-alpha';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

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
  condition: string;
  temperature: string;
  apparentTemperature: string;
  range: string;
  rainProbability: string;
  stats: readonly WeatherCardStat[];
  metricsAccessibilityLabel: string;
  rainTimeline?: WeatherCardRainTimeline;
  accessibilityLabel: string;
  testID?: string;
}>;

const RAIN_BAR_MAX_HEIGHT = 34;
const RAIN_BAR_SIGNIFICANT_THRESHOLD = 40;

export function WeatherCard({
  condition,
  temperature,
  apparentTemperature,
  range,
  rainProbability,
  stats,
  metricsAccessibilityLabel,
  rainTimeline,
  accessibilityLabel,
  testID,
}: WeatherCardProps) {
  const theme = useKuyaraTheme();
  const { fontScale } = useWindowDimensions();
  const usesStackedLayout = fontScale > 1.5;
  const significantBarColor = theme.colors.brandAccent;
  const mutedBarColor = withAlpha(theme.colors.brandAccent, 0.3);

  return (
    <View
      style={[styles.card, { backgroundColor: withAlpha(theme.colors.brandAccent, 0.08) }]}
      testID={testID}>
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        style={[styles.primaryRow, usesStackedLayout && styles.stackedPrimaryRow]}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <WeatherGlyph />
        </View>
        <View style={styles.conditionGroup}>
          <AppText style={styles.conditionText} variant="bodyStrong">
            {`${temperature} · ${condition}`}
          </AppText>
          <AppText colorRole="brandAccent" style={styles.feelsText} variant="caption">
            {`${apparentTemperature} · ${range}`}
          </AppText>
        </View>
      </View>

      <View
        accessible
        accessibilityLabel={metricsAccessibilityLabel}
        style={[styles.statsRow, { borderTopColor: theme.colors.borderSubtle }]}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <AppText colorRole="textSecondary" variant="eyebrow">
              {stat.label}
            </AppText>
            <AppText style={styles.statValue} variant="bodyStrong">
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    gap: spacing.md,
    padding: spacing.lg,
  },
  primaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  stackedPrimaryRow: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  conditionGroup: {
    flex: 1,
    flexShrink: 1,
  },
  conditionText: {
    fontSize: 14,
    lineHeight: 18,
  },
  feelsText: {
    marginTop: spacing.xs,
  },
  statsRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingTop: spacing.md,
    rowGap: spacing.md,
  },
  stat: {
    gap: spacing.xs,
  },
  statValue: {
    fontSize: 13,
    lineHeight: 17,
  },
  timeline: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  bars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    height: RAIN_BAR_MAX_HEIGHT + 20,
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
