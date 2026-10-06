import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AppText, DrawReveal, Icon, resolveCardFill, useTextScaling } from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import { resolveConditionStyle } from '@/features/weather/domain/condition-style';
import type { WeatherConditionCode } from '@/features/weather/domain/weather';
import { useEasierToSee, useVisibility } from '@/theme/easier-to-see';
import { layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { temperatureStops, type TemperatureGradientStop } from './temperature-gradient';

// The rail is a graphic, not type: it stays 6 points tall at every text size (8 with Easier
// to see), because a band that grew with Dynamic Type would leave the row without a legible
// number beside it long before it gained any meaning. Its dot is the current temperature on
// today's row: the primary ink, ringed in the card's own fill so it reads on any colour.
//
// Each capsule is coloured on the fixed temperature scale the hourly line uses, clipped to
// the day's own low and high, so a temperature has one colour on every row and in both
// cards. Colour follows the Celsius value whatever unit the numbers are in, and it is never
// the only signal: the low and the high sit beside the capsule and the row's label states
// them.
const RAIL_HEIGHT = 6;
const EASIER_RAIL_HEIGHT = 8;
const DOT_SIZE = 10;
const EASIER_DOT_SIZE = 12;
const DOT_RING = 2;
// The glyph column the separator starts after (Law 6: 20 beside `body`).
const GLYPH_SIZE = 20;
// Every rail has to sit on a track of the SAME length, or the same temperature lands at a
// different position on each row and the comparison the rail exists for is gone. So the
// range column takes a fixed share of the row and the day column takes what is left,
// rather than the two dividing the slack by content width. Measured on a 402 point screen,
// where the row is 335 wide: this leaves the range column 194 and the day column 105, and
// that is why the precipitation sits under the weekday rather than beside it (the ADR 0028
// label and supporting-text anatomy). Beside it, "12 mm · 80%" alone took 108 points and
// squeezed the track from 164 on a dry row down to 57 on a wet one.
const RANGE_COLUMN_SHARE = '58%';

export type DailyOutlookRow = Readonly<{
  key: string;
  accessibilityLabel: string;
  weekday: string;
  condition: WeatherConditionCode;
  /** The already-formatted chance, with its amount when the provider measured one, on one
   *  line and stacked on two; null when the day carries neither: the cell is then empty and
   *  the row loses a line. */
  precipitation: Readonly<{ line: string; lines: string }> | null;
  minimum: string;
  maximum: string;
  minimumCelsius: number;
  maximumCelsius: number;
  /** Set on today's row only, and read as a position inside the week's own range. */
  currentCelsius: number | null;
}>;

export type DailyOutlookProps = Readonly<{
  rows: readonly DailyOutlookRow[];
  /** True when this forecast is the first to reach the screen: each range grows in once. */
  drawIn?: boolean;
  /** Holds the growth at its start while the tab is not yet shown. */
  waiting?: boolean;
}>;

export function DailyOutlook({ rows, drawIn = false, waiting = false }: DailyOutlookProps) {
  const theme = useKuyaraTheme();
  const { controlScale, usesStackedLayout } = useTextScaling();
  const easierToSee = useEasierToSee();
  const { higherContrast } = useVisibility();
  const ramp = theme.temperature[higherContrast ? 'strong' : 'standard'];
  const railHeight = easierToSee ? EASIER_RAIL_HEIGHT : RAIL_HEIGHT;
  // The dot and its ring together: the ring is drawn inside the view's edge.
  const markerSize = (easierToSee ? EASIER_DOT_SIZE : DOT_SIZE) + DOT_RING * 2;

  // Every rail is positioned against the same range, which is what makes a warm Sunday sit
  // visibly to the right of a cold Friday instead of each row filling its own bar.
  const temperatures = rows.flatMap((row) => [row.minimumCelsius, row.maximumCelsius]);
  const weekMinimum = Math.min(...temperatures);
  const weekSpan = Math.max(...temperatures) - weekMinimum;
  const position = (value: number) => (
    weekSpan <= 0 ? 0 : Math.min(1, Math.max(0, (value - weekMinimum) / weekSpan))
  );

  const glyphSize = GLYPH_SIZE * controlScale;

  return (
    <View testID="weather-daily-outlook">
      {rows.map((row, index) => {
        const conditionStyle = resolveConditionStyle(row.condition, 'day');
        const start = position(row.minimumCelsius);
        // A week with no spread at all gives every day the whole rail rather than nothing.
        const width = weekSpan <= 0 ? 1 : position(row.maximumCelsius) - start;
        // Stacked, the two numbers take the whole width on their own line and the track
        // drops below them: left between them it collapses to a few points and stops being
        // a comparison at exactly the size that needs one most.
        const rail = (
          <View
            style={[
              styles.rail,
              usesStackedLayout && styles.stackedRail,
              { backgroundColor: theme.colors.surfaceMuted, height: railHeight },
            ]}
            testID="weather-daily-rail">
            {/* Each range is uncovered from its low to its high, a row after the hourly
                series: a clip rather than a stretch, so the colours never squeeze. */}
            <View style={styles.track}>
              <RangeCapsule
                gradientId={`daily-temperature-${row.key}`}
                height={railHeight}
                index={index + 1}
                play={drawIn}
                start={start}
                stops={temperatureStops(ramp, row.minimumCelsius, row.maximumCelsius)}
                waiting={waiting}
                width={width}
              />
            </View>
            {row.currentCelsius === null ? null : (
              <View
                style={[
                  styles.railMarker,
                  {
                    backgroundColor: theme.colors.textPrimary,
                    borderColor: resolveCardFill(theme),
                    height: markerSize,
                    left: `${position(row.currentCelsius) * 100}%`,
                    marginStart: -markerSize / 2,
                    top: (railHeight - markerSize) / 2,
                    width: markerSize,
                  },
                ]}
                testID="weather-daily-rail-marker"
              />
            )}
          </View>
        );
        return (
          <Fragment key={row.key}>
            {index === 0 ? null : (
              <Divider
                style={usesStackedLayout
                  ? undefined
                  : { marginStart: glyphSize + spacing.md }}
              />
            )}
            <View
              accessible
              accessibilityLabel={row.accessibilityLabel}
              style={[styles.row, usesStackedLayout && styles.stackedRow]}
              testID="weather-daily-row">
              <View style={[styles.dayGroup, usesStackedLayout && styles.stackedGroup]}>
                <Icon
                  color={theme.condition[conditionStyle.ink]}
                  name={conditionStyle.shape}
                  size={glyphSize}
                />
                <View style={styles.labelColumn}>
                  <AppText variant="body">{row.weekday}</AppText>
                  {/* An empty cell rather than a dash or a zero: a day with no measured
                      rain and no chance has nothing to report, so the row simply loses its
                      second line. The row's own accessibility label still states the
                      chance, so the blank costs a reader nothing. */}
                  {row.precipitation === null ? null : (
                    <PrecipitationCell {...row.precipitation} />
                  )}
                </View>
              </View>
              <View
                style={[
                  styles.rangeGroup,
                  usesStackedLayout && styles.stackedGroup,
                  usesStackedLayout && styles.stackedRangeGroup,
                ]}>
                <AppText
                  colorRole="textSecondary"
                  style={styles.temperature}
                  tabularNumbers
                  variant="body">
                  {row.minimum}
                </AppText>
                {usesStackedLayout ? null : rail}
                <AppText style={styles.temperature} tabularNumbers variant="body">
                  {row.maximum}
                </AppText>
              </View>
              {usesStackedLayout ? rail : null}
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

/**
 * One day's low-to-high capsule on the shared track, filled with its stretch of the
 * temperature scale. The gradient is drawn at the capsule's measured width, so it waits for
 * that width before it draws or reveals.
 */
function RangeCapsule({ gradientId, height, index, play, start, stops, waiting, width }: Readonly<{
  gradientId: string;
  height: number;
  index: number;
  play: boolean;
  start: number;
  stops: readonly TemperatureGradientStop[];
  waiting: boolean;
  width: number;
}>) {
  const [measured, setMeasured] = useState<number | null>(null);
  return (
    <View
      onLayout={({ nativeEvent }) => setMeasured(nativeEvent.layout.width)}
      style={[styles.capsule, { left: `${start * 100}%`, minWidth: height, width: `${width * 100}%` }]}
      testID="weather-daily-rail-fill">
      {measured === null ? null : (
        <DrawReveal
          index={index}
          play={play}
          span={measured}
          testID="weather-daily-rail-reveal"
          waiting={waiting}
          width={measured}>
          <Svg
            accessibilityElementsHidden
            height={height}
            importantForAccessibility="no-hide-descendants"
            width={measured}>
            {stops.length === 1 ? null : (
              <Defs>
                <LinearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
                  {stops.map((stop) => <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />)}
                </LinearGradient>
              </Defs>
            )}
            <Rect
              fill={stops.length === 1 ? stops[0].color : `url(#${gradientId})`}
              height={height}
              testID="weather-daily-rail-paint"
              width={measured}
            />
          </Svg>
        </DrawReveal>
      )}
    </View>
  );
}

/**
 * The caption with its icon. The row is as wide as the day column, which no text inside it
 * changes, so measuring it cannot loop: a column that later widens (a rotation, a split view)
 * starts the caption again from the one-line form, which stays only if it still fits.
 */
function PrecipitationCell({ line, lines }: Readonly<{ line: string; lines: string }>) {
  const theme = useKuyaraTheme();
  const { controlScale, fontScale } = useTextScaling();
  const [width, setWidth] = useState<number | null>(null);
  return (
    <View
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      style={styles.precipitation}
      testID="weather-daily-precipitation-cell">
      <Icon color={theme.colors.iconSecondary} name="precipitationChance" size={16 * controlScale} />
      <PrecipitationCaption
        // A new value, text size or column width starts again from the one-line form.
        key={`${line}@${fontScale}@${width}`}
        line={line}
        lines={lines}
      />
    </View>
  );
}

/**
 * The day's amount and chance on one line when it fits the day column. When it wraps, it is
 * shown stacked instead, one value per line, so a line never begins with the separator:
 * measured on the Simulator, iOS breaks even a run held by no-break spaces once that run is
 * wider than the column.
 */
function PrecipitationCaption({ line, lines }: Readonly<{ line: string; lines: string }>) {
  const [stacked, setStacked] = useState(false);
  return (
    <AppText
      colorRole="textSecondary"
      onTextLayout={stacked ? undefined : ({ nativeEvent }) => {
        if (nativeEvent.lines.length > 1) setStacked(true);
      }}
      style={styles.precipitationText}
      tabularNumbers
      testID="weather-daily-precipitation"
      variant="caption">
      {stacked ? lines : line}
    </AppText>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.minimumTouchTarget,
    paddingVertical: spacing.sm,
  },
  // Above `fontScale` 1.5 the range stacks under the day (ADR 0028 section 3) instead of
  // squeezing the track out between two numbers that no longer fit beside it.
  stackedRow: { alignItems: 'stretch', flexDirection: 'column', gap: spacing.sm },
  stackedGroup: { flexGrow: 0, width: '100%' },
  stackedRangeGroup: { justifyContent: 'space-between' },
  stackedRail: { alignSelf: 'stretch', flexGrow: 0 },
  dayGroup: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
  labelColumn: { flex: 1, gap: spacing.xs, minWidth: 0 },
  precipitation: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, minWidth: 0 },
  // Shrinkable so a wet day's caption wraps beside its icon at the largest standard text
  // size instead of measuring one line wide and running into the low temperature.
  precipitationText: { flexShrink: 1, minWidth: 0 },
  rangeGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexGrow: 0,
    flexShrink: 0,
    gap: spacing.sm,
    width: RANGE_COLUMN_SHARE,
  },
  temperature: { textAlign: 'right' },
  // The rail does not clip: today's dot is taller than it and overhangs it. The capsules
  // sit in a clipping layer of their own instead, so a day whose low and high are the same
  // still shows as a round mark rather than as nothing, kept inside the track at the warm
  // end, and each capsule clips its colours to its own rounded ends.
  rail: { borderRadius: radii.pill, flex: 1 },
  track: { borderRadius: radii.pill, bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0 },
  capsule: { borderRadius: radii.pill, bottom: 0, overflow: 'hidden', position: 'absolute', top: 0 },
  railMarker: { borderRadius: radii.pill, borderWidth: DOT_RING, position: 'absolute' },
});
