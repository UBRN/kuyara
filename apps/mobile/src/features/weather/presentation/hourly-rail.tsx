import { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { AppText, Icon, resolveCardFill, useTextScaling } from '@/components/ui';
import type { Daypart } from '@/features/today/domain/atmosphere-state';
import { resolveConditionStyle } from '@/features/today/domain/condition-style';
import type { WeatherConditionCode } from '@/features/weather/domain/weather';
import { borderWidths, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { HOURLY_LABEL_LIFT, layoutHourlyRail } from './hourly-rail-layout';

// O14 rail A. A column is 52 wide at a pitch of 56, so a 393-point phone shows six whole
// hours and a preview of the seventh under the edge fade. The widest temperature a column
// carries is six glyphs ("-12,0°"), about 46 points in `label` at the default size; the
// column grows with the text so it still holds at the largest standard size.
const COLUMN_WIDTH = 52;
const COLUMN_GROWTH = 0.92;
const PLOT_HEIGHT = 40;
const PLOT_GROWTH_CAP = 1.25;
// `label`'s line box. Feature code may not name the typography metric here (the greppable
// Law 5 check), so the label row reserves it by number.
const TEMPERATURE_LABEL_HEIGHT = 20;
const FADE_WIDTH = 28;
const DOT_RADIUS = 3;
const NOW_DOT_RADIUS = 4.5;

export type HourlyRailColumn = Readonly<{
  key: string;
  accessibilityLabel: string;
  time: string;
  /** "Now" and the first hour of a new day read in the primary ink at weight 600. */
  timeEmphasis?: 'now' | 'newDay';
  condition: WeatherConditionCode;
  daypart: Daypart | null;
  temperature: string;
  temperatureCelsius: number;
  precipitation: string;
  precipitationProbability: number;
}>;

export function HourlyRail({ columns }: Readonly<{ columns: readonly HourlyRailColumn[] }>) {
  const theme = useKuyaraTheme();
  const { controlScale, fontScale } = useTextScaling();
  // The plot band's offset inside a column depends on the scaled line boxes above it, so
  // it is measured once from the first column rather than recomputed from type tokens.
  const [bandTop, setBandTop] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const handleBandLayout = useCallback((event: LayoutChangeEvent) => {
    setBandTop(event.nativeEvent.layout.y);
  }, []);
  // The left fade appears once the first hour has moved under the card's edge; React
  // skips the render while the flag does not change, so this is not a render per frame.
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(event.nativeEvent.contentOffset.x > 1);
  }, []);

  const cardFill = resolveCardFill(theme);
  const columnWidth = Math.round(COLUMN_WIDTH * Math.max(1, fontScale * COLUMN_GROWTH));
  const labelHeight = TEMPERATURE_LABEL_HEIGHT * fontScale;
  const { bandHeight, contentWidth, path, points } = layoutHourlyRail(
    columns.map((column) => column.temperatureCelsius),
    {
      columnGap: spacing.xs,
      columnWidth,
      inset: spacing.lg,
      labelHeight,
      plotHeight: Math.round(PLOT_HEIGHT * Math.min(fontScale, PLOT_GROWTH_CAP)),
    },
  );

  return (
    <View style={styles.rail}>
      <ScrollView
        decelerationRate="normal"
        horizontal
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        testID="weather-hourly-rail">
        <View style={{ width: contentWidth }}>
          {path !== '' && bandTop !== null ? (
            <Svg
              accessibilityElementsHidden
              height={bandHeight}
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={[styles.series, { top: bandTop }]}
              testID="weather-hourly-series"
              width={contentWidth}>
              <Path
                d={path}
                fill="none"
                stroke={theme.colors.brandAccent}
                strokeLinecap="round"
                strokeWidth={2}
                testID="weather-hourly-series-line"
              />
              {points.map((point, index) => (
                <Circle
                  cx={point.x}
                  cy={point.y}
                  // The first dot is the current hour: filled and a little larger.
                  fill={index === 0 ? theme.colors.brandAccent : cardFill}
                  key={columns[index].key}
                  r={index === 0 ? NOW_DOT_RADIUS : DOT_RADIUS}
                  stroke={theme.colors.brandAccent}
                  strokeWidth={2}
                />
              ))}
            </Svg>
          ) : null}
          <View style={styles.columns}>
            {columns.map((column, index) => {
              const conditionStyle = resolveConditionStyle(column.condition, column.daypart);
              const emphasised = column.timeEmphasis !== undefined;
              return (
                <View
                  accessible
                  accessibilityLabel={column.accessibilityLabel}
                  key={column.key}
                  style={[styles.column, { width: columnWidth }]}>
                  {column.timeEmphasis === 'newDay' ? (
                    // A hairline at midnight: the day changes between these two columns.
                    <View
                      style={[styles.dayDivider, { backgroundColor: theme.colors.borderSubtle }]}
                      testID="weather-hourly-day-divider"
                    />
                  ) : null}
                  <AppText
                    colorRole={emphasised ? 'textPrimary' : 'textSecondary'}
                    style={emphasised ? styles.emphasisedTime : undefined}
                    tabularNumbers
                    variant="caption">
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
                    {/* The number rides above its own dot, so the curve never crosses it
                        and nothing has to be knocked out of the line. */}
                    <AppText
                      numberOfLines={1}
                      style={[
                        styles.temperature,
                        { top: points[index].y - labelHeight - HOURLY_LABEL_LIFT },
                      ]}
                      tabularNumbers
                      testID="weather-hourly-temperature"
                      variant="label">
                      {column.temperature}
                    </AppText>
                  </View>
                  {/* A dry hour says nothing rather than saying zero: a rail of "0%" under
                      every column is noise the eye has to read past. The slot keeps its
                      height, so every column's dot and label stay on one grid. The
                      column's own accessibility label states the chance either way. */}
                  <View style={styles.chance}>
                    {column.precipitationProbability > 0 ? (
                      <>
                        <Icon
                          color={theme.colors.iconSecondary}
                          name="precipitationChance"
                          size={14 * controlScale}
                        />
                        <AppText colorRole="textSecondary" tabularNumbers variant="caption">
                          {column.precipitation}
                        </AppText>
                      </>
                    ) : (
                      <AppText variant="caption">{' '}</AppText>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
      {scrolled ? <EdgeFade color={cardFill} side="left" /> : null}
      <EdgeFade color={cardFill} side="right" />
    </View>
  );
}

/** A 28-point fade to the card's own fill, telling the rail continues past this edge. */
function EdgeFade({ color, side }: Readonly<{ color: string; side: 'left' | 'right' }>) {
  const id = `hourly-fade-${side}`;
  return (
    <Svg
      accessibilityElementsHidden
      height="100%"
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.fade, side === 'left' ? styles.fadeLeft : styles.fadeRight]}
      testID={`weather-hourly-fade-${side}`}
      width={FADE_WIDTH}>
      <Defs>
        <LinearGradient id={id} x1={side === 'left' ? '1' : '0'} x2={side === 'left' ? '0' : '1'} y1="0" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity={0} />
          <Stop offset="1" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${id})`} height="100%" width={FADE_WIDTH} x={0} y={0} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  // The rail bleeds to the card's edges, so its content clips at the card rather than at
  // the card's inset, while the first column still aligns with the heading above it.
  rail: { marginHorizontal: -spacing.lg },
  series: { left: 0, position: 'absolute' },
  columns: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  column: { alignItems: 'center', gap: spacing.xs },
  emphasisedTime: { fontWeight: '600' },
  dayDivider: {
    bottom: 0,
    left: -spacing.xs / 2,
    position: 'absolute',
    top: 0,
    width: borderWidths.subtle,
  },
  chance: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs / 2 },
  // The band's only child is absolutely positioned, so without this the centred column
  // collapses it to zero width and the label has nothing to centre in.
  band: { alignItems: 'center', alignSelf: 'stretch' },
  temperature: {
    position: 'absolute',
    textAlign: 'center',
  },
  fade: { bottom: 0, position: 'absolute', top: 0 },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
});
