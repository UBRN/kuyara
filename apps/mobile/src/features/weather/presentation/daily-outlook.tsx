import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Icon, resolveCardFill, useTextScaling } from '@/components/ui';
import { Divider } from '@/components/ui/divider';
import { resolveConditionStyle } from '@/features/today/domain/condition-style';
import type { WeatherConditionCode } from '@/features/weather/domain/weather';
import { layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The rail is a graphic, not type: it stays 4 points tall at every text size, because a
// band that grew with Dynamic Type would leave the row without a legible number beside it
// long before it gained any meaning. Its dot is the current temperature on today's row.
//
// Its fill is `brandAccent` and not the day's condition ink, which the glyph already
// carries: one hue for one quantity, the same hue the hourly card draws its temperature
// series in, so the two cards read as one encoding of temperature rather than as two
// accents competing. Law 1 counts accent-FILLED elements; these are data marks in the same
// family as that series and are bounded by this rule instead.
const RAIL_HEIGHT = 4;
const MARKER_SIZE = 3;
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
  /** The already-formatted chance, with its amount when the provider measured one, or null
   *  when the day carries neither: the cell is then empty and the row loses a line. */
  precipitation: string | null;
  minimum: string;
  maximum: string;
  minimumCelsius: number;
  maximumCelsius: number;
  /** Set on today's row only, and read as a position inside the week's own range. */
  currentCelsius: number | null;
}>;

export function DailyOutlook({ rows }: Readonly<{ rows: readonly DailyOutlookRow[] }>) {
  const theme = useKuyaraTheme();
  const { controlScale, usesStackedLayout } = useTextScaling();

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
              { backgroundColor: theme.colors.surfaceMuted },
            ]}
            testID="weather-daily-rail">
            <View
              style={[
                styles.railFill,
                {
                  backgroundColor: theme.colors.brandAccent,
                  left: `${start * 100}%`,
                  width: `${width * 100}%`,
                },
              ]}
              testID="weather-daily-rail-fill"
            />
            {row.currentCelsius === null ? null : (
              <View
                style={[
                  styles.railMarker,
                  {
                    // The card's own fill, knocked out of the accent the way the hourly
                    // rail knocks its numbers out of the series.
                    backgroundColor: resolveCardFill(theme),
                    left: `${position(row.currentCelsius) * 100}%`,
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
                    <View style={styles.precipitation}>
                      <Icon
                        color={theme.colors.iconSecondary}
                        name="precipitationChance"
                        size={16 * controlScale}
                      />
                      <AppText colorRole="textSecondary" tabularNumbers variant="caption">
                        {row.precipitation}
                      </AppText>
                    </View>
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
  precipitation: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  rangeGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flexGrow: 0,
    flexShrink: 0,
    gap: spacing.sm,
    width: RANGE_COLUMN_SHARE,
  },
  temperature: { textAlign: 'right' },
  rail: { borderRadius: radii.pill, flex: 1, height: RAIL_HEIGHT, overflow: 'hidden' },
  // A day whose low and high are the same still shows as a mark rather than as nothing,
  // and the rail's own `overflow` keeps that mark inside the track at the warm end.
  railFill: { borderRadius: radii.pill, bottom: 0, minWidth: RAIL_HEIGHT, position: 'absolute', top: 0 },
  railMarker: {
    borderRadius: radii.pill,
    height: MARKER_SIZE,
    marginStart: -MARKER_SIZE / 2,
    position: 'absolute',
    top: (RAIL_HEIGHT - MARKER_SIZE) / 2,
    width: MARKER_SIZE,
  },
});
