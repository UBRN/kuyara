import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, Surface } from '@/components/ui';
import type { LoadedTodayPresentation } from '@/features/today/presentation/today-presentation';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type WeatherSummaryProps = Readonly<{
  weather: LoadedTodayPresentation['weather'];
}>;

export function WeatherSummary({ weather }: WeatherSummaryProps) {
  const theme = useKuyaraTheme();
  const { fontScale } = useWindowDimensions();
  const usesStackedLayout = fontScale > 1.5;

  return (
    <Surface
      accessible
      accessibilityLabel={weather.accessibilityLabel}
      testID="today-weather-summary"
      style={styles.card}
      variant="elevated">
      <View style={[styles.primaryRow, usesStackedLayout && styles.stackedPrimaryRow]}>
        <View style={styles.conditionGroup}>
          <SymbolView
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            name={{ ios: 'cloud.rain.fill', android: 'rainy', web: 'rainy' }}
            size={32}
            tintColor={theme.colors.iconSecondary}
          />
          <AppText variant="bodyStrong" style={styles.condition}>
            {weather.condition}
          </AppText>
        </View>
        <AppText variant="display" style={styles.temperature}>
          {weather.temperature}
        </AppText>
      </View>

      <View style={[styles.metrics, usesStackedLayout && styles.stackedMetrics]}>
        <AppText colorRole="textSecondary">{weather.apparentTemperature}</AppText>
        <AppText colorRole="textSecondary">{weather.range}</AppText>
        <AppText colorRole="textSecondary">{weather.rainProbability}</AppText>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
  primaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
  },
  stackedPrimaryRow: {
    alignItems: 'flex-start',
    flexDirection: 'column-reverse',
  },
  conditionGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.md,
  },
  condition: {
    flex: 1,
    flexShrink: 1,
  },
  temperature: {
    flexShrink: 0,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  stackedMetrics: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
});
