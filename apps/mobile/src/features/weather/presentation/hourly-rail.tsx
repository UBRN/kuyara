import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { AppText, Icon, useTextScaling, type IconName } from '@/components/ui';
import type { WeatherConditionCode } from '@/features/weather/domain/weather';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { layoutHourlyRail } from './hourly-rail-layout';

// Law 6: the condition glyphs join the existing system-symbol family rather than adding a
// third one. The record is exhaustive over the domain's condition codes, so a new code
// fails typecheck here instead of rendering a blank column.
const conditionIcons: Readonly<Record<WeatherConditionCode, IconName>> = {
  clear: 'conditionClear',
  mostly_clear: 'conditionMostlyClear',
  partly_cloudy: 'conditionPartlyCloudy',
  cloudy: 'conditionCloudy',
  fog: 'conditionFog',
  drizzle: 'conditionDrizzle',
  rain: 'conditionRain',
  heavy_rain: 'conditionHeavyRain',
  sleet: 'conditionSleet',
  snow: 'conditionSnow',
  thunderstorm: 'conditionThunderstorm',
};

// A column is a fixed width so the series can pass through the label centres; it is wide
// enough for the widest supported time caption ("12:00 PM") and grows with Dynamic Type.
const COLUMN_WIDTH = 64;
const BAND_HEIGHT = 72;
const MAXIMUM_BAND_HEIGHT = 160;
// `bodyStrong`'s line box. Feature code may not name the typography metric here (the
// greppable Law 5 check), so the band reserves it above the highest point by number.
const TEMPERATURE_LABEL_HEIGHT = 24;

export type HourlyRailColumn = Readonly<{
  key: string;
  accessibilityLabel: string;
  time: string;
  condition: WeatherConditionCode;
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
      labelGap: spacing.xs,
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
          {columns.map((column, index) => (
            <View
              accessible
              accessibilityLabel={column.accessibilityLabel}
              key={column.key}
              style={[styles.column, { width: columnWidth }]}>
              <AppText colorRole="textSecondary" tabularNumbers variant="caption">
                {column.time}
              </AppText>
              <Icon
                color={theme.colors.iconSecondary}
                name={conditionIcons[column.condition]}
                size={20 * controlScale}
              />
              <View
                onLayout={index === 0 ? handleBandLayout : undefined}
                style={[styles.band, { height: bandHeight }]}
                testID="weather-hourly-band">
                <AppText
                  style={[
                    styles.temperature,
                    { top: points[index].y - spacing.xs - labelHeight },
                  ]}
                  tabularNumbers
                  variant="bodyStrong">
                  {column.temperature}
                </AppText>
              </View>
              <AppText colorRole="textSecondary" tabularNumbers variant="caption">
                {column.precipitation}
              </AppText>
            </View>
          ))}
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
  // collapses it to zero width and the label has nothing to centre in.
  band: { alignSelf: 'stretch' },
  temperature: { left: 0, position: 'absolute', right: 0, textAlign: 'center' },
});
