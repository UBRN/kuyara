import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { AppText, DrawReveal, Icon, resolveCardFill, useTextScaling } from '@/components/ui';
import type { Daypart } from '@/features/today/domain/atmosphere-state';
import { resolveConditionStyle } from '@/features/today/domain/condition-style';
import type { WeatherConditionCode } from '@/features/weather/domain/weather';
import { borderWidths, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { hourlyRailMetrics, layoutHourlyRail, type HourlyRailLayout } from './hourly-rail-layout';

const FADE_WIDTH = 28;
const DOT_RADIUS = 3;
const NOW_DOT_RADIUS = 4.5;

/** "Now" and the first hour of a new day read in the primary ink at weight 600. */
export type HourlyTimeEmphasis = 'now' | 'newDay';

export type HourlyRailColumn = Readonly<{
  key: string;
  accessibilityLabel: string;
  time: string;
  timeEmphasis?: HourlyTimeEmphasis;
  condition: WeatherConditionCode;
  daypart: Daypart | null;
  temperature: string;
  temperatureCelsius: number;
  precipitation: string;
  precipitationProbability: number;
}>;

export type HourlyRailProps = Readonly<{
  columns: readonly HourlyRailColumn[];
  /** True when this forecast is the first to reach the screen: the series draws in once. */
  drawIn?: boolean;
  /** Holds the drawing at its start while the tab is not yet shown. */
  waiting?: boolean;
}>;

export function HourlyRail({ columns, drawIn = false, waiting = false }: HourlyRailProps) {
  const theme = useKuyaraTheme();
  const { width: windowWidth } = useWindowDimensions();
  const { fontScale } = useTextScaling();
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
  // The rail opens on "Now": coming back to the screen, or a change in which hour leads the
  // rail, scrolls it back to the start. A refresh that keeps the same hours leaves it alone.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToNow = useCallback(() => {
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, []);
  useFocusEffect(scrollToNow);
  const currentHour = columns[0]?.key;
  useEffect(scrollToNow, [currentHour, scrollToNow]);

  const cardFill = resolveCardFill(theme);
  const metrics = hourlyRailMetrics(fontScale, { columnGap: spacing.xs, inset: spacing.lg });
  const layout = layoutHourlyRail(columns.map((column) => column.temperatureCelsius), metrics);

  return (
    <View style={styles.rail}>
      <ScrollView
        decelerationRate="normal"
        horizontal
        onScroll={handleScroll}
        ref={scrollRef}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        testID="weather-hourly-rail">
        <View style={{ width: layout.contentWidth }}>
          {layout.path !== '' && bandTop !== null ? (
            // The series draws from the first hour across the hours in view; the
            // temperatures above it are drawn from the start.
            <DrawReveal
              play={drawIn}
              span={Math.min(layout.contentWidth, windowWidth)}
              style={[styles.series, { top: bandTop }]}
              testID="weather-hourly-series-reveal"
              waiting={waiting}
              width={layout.contentWidth}>
              <HourlySeries cardFill={cardFill} columns={columns} layout={layout} />
            </DrawReveal>
          ) : null}
          <View style={styles.columns}>
            {columns.map((column, index) => (
              <HourlyColumn
                bandHeight={layout.bandHeight}
                column={column}
                key={column.key}
                labelTop={layout.labelTops[index]}
                onBandLayout={index === 0 ? handleBandLayout : undefined}
                width={metrics.columnWidth}
              />
            ))}
          </View>
        </View>
      </ScrollView>
      {scrolled ? <EdgeFade color={cardFill} side="left" /> : null}
      <EdgeFade color={cardFill} side="right" />
    </View>
  );
}

/** The accent temperature curve and one dot per hour; the first, the current hour, filled. */
function HourlySeries({ cardFill, columns, layout }: Readonly<{
  cardFill: string;
  columns: readonly HourlyRailColumn[];
  layout: HourlyRailLayout;
}>) {
  const theme = useKuyaraTheme();
  return (
    <Svg
      accessibilityElementsHidden
      height={layout.bandHeight}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID="weather-hourly-series"
      width={layout.contentWidth}>
      <Path
        d={layout.path}
        fill="none"
        stroke={theme.colors.brandAccent}
        strokeLinecap="round"
        strokeWidth={2}
        testID="weather-hourly-series-line"
      />
      {layout.points.map((point, index) => (
        <Circle
          cx={point.x}
          cy={point.y}
          fill={index === 0 ? theme.colors.brandAccent : cardFill}
          key={columns[index].key}
          r={index === 0 ? NOW_DOT_RADIUS : DOT_RADIUS}
          stroke={theme.colors.brandAccent}
          strokeWidth={2}
        />
      ))}
    </Svg>
  );
}

/** One hour: its time, condition, temperature over its dot, and chance of precipitation. */
function HourlyColumn({ bandHeight, column, labelTop, onBandLayout, width }: Readonly<{
  bandHeight: number;
  column: HourlyRailColumn;
  labelTop: number;
  onBandLayout?: (event: LayoutChangeEvent) => void;
  width: number;
}>) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const conditionStyle = resolveConditionStyle(column.condition, column.daypart);
  const emphasised = column.timeEmphasis !== undefined;
  return (
    <View
      accessible
      accessibilityLabel={column.accessibilityLabel}
      style={[styles.column, { width }]}>
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
        onLayout={onBandLayout}
        style={[styles.band, { height: bandHeight }]}
        testID="weather-hourly-band">
        {/* The number rides above its own dot, so the curve never crosses it and nothing
            has to be knocked out of the line. */}
        <AppText
          numberOfLines={1}
          style={[styles.temperature, { top: labelTop }]}
          tabularNumbers
          testID="weather-hourly-temperature"
          variant="label">
          {column.temperature}
        </AppText>
      </View>
      {/* A dry hour says nothing rather than saying zero: a rail of "0%" under every column
          is noise the eye has to read past. The slot keeps its height, so every column's
          dot and label stay on one grid. The column's own accessibility label states the
          chance either way. */}
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
          <AppText variant="caption">{' '}</AppText>
        )}
      </View>
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
