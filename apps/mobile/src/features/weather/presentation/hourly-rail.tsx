import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { AppText, Icon, useTextScaling } from '@/components/ui';
import { resolveConditionStyle } from '@/features/today/domain/condition-style';
import type { WeatherConditionCode } from '@/features/weather/domain/weather';
import { radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { layoutHourlyRail } from './hourly-rail-layout';

// A column is a fixed width so the series can pass through the label centres; it is wide
// enough for the widest supported time caption ("12:00 PM") and grows with Dynamic Type.
const COLUMN_WIDTH = 64;
const BAND_HEIGHT = 72;
const MAXIMUM_BAND_HEIGHT = 160;
// `bodyStrong`'s line box. Feature code may not name the typography metric here (the
// greppable Law 5 check), so the band reserves half of it at each end by number.
const TEMPERATURE_LABEL_HEIGHT = 24;

export type HourlyRailColumn = Readonly<{
  key: string;
  accessibilityLabel: string;
  time: string;
  condition: WeatherConditionCode;
  localHour: number | null;
  temperature: string;
  temperatureCelsius: number;
  precipitation: string;
}>;

export function HourlyRail({ columns }: Readonly<{ columns: readonly HourlyRailColumn[] }>) {
  const theme = useKuyaraTheme();
  const { controlScale, fontScale } = useTextScaling();
  // The plot band's offset inside a column depends on the scaled line boxes above it, so
  // it is measured once from the first column rather than recomputed from type tokens.
  const [bandTop, setBandTop] = useState<number | null>(null);
  const handleBandLayout = useCallback((event: LayoutChangeEvent) => {
    setBandTop(event.nativeEvent.layout.y);
  }, []);

  const columnWidth = Math.round(COLUMN_WIDTH * fontScale);
  const bandHeight = Math.min(BAND_HEIGHT * fontScale, MAXIMUM_BAND_HEIGHT);
  const labelHeight = TEMPERATURE_LABEL_HEIGHT * fontScale;
  const { contentWidth, points, polyline } = layoutHourlyRail(
    columns.map((column) => column.temperatureCelsius),
    {
      bandHeight,
      columnGap: spacing.sm,
      columnWidth,
      inset: spacing.lg,
      labelHeight,
    },
  );

  return (
    <ScrollView
      decelerationRate="normal"
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.rail}
      testID="weather-hourly-rail">
      <View style={{ width: contentWidth }}>
        {polyline !== '' && bandTop !== null ? (
          <Svg
            accessibilityElementsHidden
            height={bandHeight}
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[styles.series, { top: bandTop }]}
            testID="weather-hourly-series"
            width={contentWidth}>
            <Polyline
              fill="none"
              points={polyline}
              stroke={theme.colors.brandAccent}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              testID="weather-hourly-series-line"
            />
          </Svg>
        ) : null}
        <View style={styles.columns}>
          {columns.map((column, index) => {
            const conditionStyle = resolveConditionStyle(column.condition, column.localHour);
            return (
              <View
                accessible
                accessibilityLabel={column.accessibilityLabel}
                key={column.key}
                style={[styles.column, { width: columnWidth }]}>
                <AppText colorRole="textSecondary" tabularNumbers variant="caption">
                  {column.time}
                </AppText>
                <Icon
                  color={theme.condition[conditionStyle.ink]}
                  name={conditionStyle.shape}
                  size={20 * controlScale}
                />
                <View
                  onLayout={index === 0 ? handleBandLayout : undefined}
                  style={[styles.band, { height: bandHeight }]}
                  testID="weather-hourly-band">
                  {/* The series passes behind the rail (ADR 0021 section 9), so each number
                      knocks the stroke out with the card's own fill rather than letting it
                      cross the digits. The label is drawn after the series, so it is on top. */}
                  <AppText
                    style={[
                      styles.temperature,
                      {
                        backgroundColor: theme.colors.surface,
                        top: points[index].y - labelHeight / 2,
                      },
                    ]}
                    tabularNumbers
                    testID="weather-hourly-temperature"
                    variant="bodyStrong">
                    {column.temperature}
                  </AppText>
                </View>
                <AppText colorRole="textSecondary" tabularNumbers variant="caption">
                  {column.precipitation}
                </AppText>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // The rail bleeds to the card's edges, so its content clips at the card rather than at
  // the card's inset, while the first column still aligns with the heading above it.
  rail: { marginHorizontal: -spacing.lg },
  series: { left: 0, position: 'absolute' },
  columns: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  column: { alignItems: 'center', gap: spacing.xs },
  // The band's only child is absolutely positioned, so without this the centred column
  // collapses it to zero width and the label has nothing to centre in. `alignItems`
  // centres the label, which now takes its own width instead of the column's, so its
  // knockout hugs the digits rather than covering the whole column.
  band: { alignItems: 'center', alignSelf: 'stretch' },
  temperature: {
    borderRadius: radii.compact,
    paddingHorizontal: spacing.xs,
    position: 'absolute',
    textAlign: 'center',
  },
});
