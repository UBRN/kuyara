import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { AppText, Icon, ScrollDepth, useTextScaling } from '@/components/ui';
import type { TodayCopy } from '@/features/today/presentation/outfit-detail-entries';
import { ArrivesAfterHandoff } from '@/features/today/presentation/today-motion';
import type { LoadedTodayPresentation } from '@/features/today/presentation/today-presentation';
import { TitleWeatherSymbol } from '@/features/today/presentation/title-weather-symbol';
import type { AmbientIntensity } from '@/features/weather/domain/ambient-intensity';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/** The place, the date, the greeting and the weather title above the outfit. */
export function TodayHeader({
  ambientIntensity,
  copy,
  displayName,
  firstDressingDay,
  presentation,
  scrollOffset,
}: Readonly<{
  ambientIntensity: AmbientIntensity;
  copy: TodayCopy;
  displayName: string | null;
  firstDressingDay: boolean;
  presentation: LoadedTodayPresentation;
  scrollOffset: SharedValue<number>;
}>) {
  const { controlScale } = useTextScaling();
  const theme = useKuyaraTheme();
  return (
    // S23: the header recedes behind the scrolling outfit the way Weather's does.
    <ScrollDepth scrollOffset={scrollOffset}>
      {/* M7: the place at left and the dressing day's date opposite it. */}
      <ArrivesAfterHandoff index={0}>
        <View style={styles.topRow} testID="today-top-row">
          <View style={styles.placeRow}>
            <Icon name="location" color={theme.colors.iconSecondary} size={16 * controlScale} />
            <AppText colorRole="textSecondary" numberOfLines={2} style={styles.location} variant="caption">
              {presentation.header.location}
            </AppText>
          </View>
          <AppText colorRole="textSecondary" tabularNumbers testID="today-date" variant="caption">
            {presentation.date}
          </AppText>
        </View>
      </ArrivesAfterHandoff>

      {displayName ? (
        <ArrivesAfterHandoff index={1}>
          <AppText colorRole="textSecondary" style={styles.greeting} testID="today-greeting" variant="bodyStrong">
            {firstDressingDay ? copy.greetingFirstNamed(displayName) : copy.greetingNamed(displayName)}
          </AppText>
        </ArrivesAfterHandoff>
      ) : null}
      {/* O2: Today has no day-type pill. Inside the title the line may break only after the
          separator: the temperature, symbol and condition stay together. */}
      <ArrivesAfterHandoff index={2}>
        <View style={styles.titleRow}>
          <View
            accessible
            accessibilityLabel={presentation.titleAccessibilityLabel}
            accessibilityRole="header"
            style={styles.title}
            testID="today-title">
            <AppText style={styles.titleText} tabularNumbers variant="title">
              {presentation.titleParts.lead}
            </AppText>
            <View style={styles.titleValues}>
              <AppText style={styles.titleText} tabularNumbers variant="title">
                {presentation.titleParts.beforeSymbol}
              </AppText>
              <TitleWeatherSymbol
                condition={presentation.weather.conditionCode}
                daypart={presentation.weather.daypart}
                intensity={ambientIntensity}
                testID="today-title-symbol"
              />
              <AppText style={styles.titleText} variant="title">
                {presentation.titleParts.afterSymbol}
              </AppText>
            </View>
          </View>
        </View>
      </ArrivesAfterHandoff>
    </ScrollDepth>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  placeRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.xs },
  location: { flex: 1, flexShrink: 1 },
  greeting: { marginBottom: spacing.xs },
  titleRow: { alignItems: 'center', columnGap: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  title: { alignItems: 'center', columnGap: spacing.sm, flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap' },
  titleValues: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  titleText: { fontWeight: '700' },
});
