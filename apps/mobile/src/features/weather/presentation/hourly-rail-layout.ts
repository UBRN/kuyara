/**
 * The geometry of the hourly rail's temperature series (ADR 0021 section 9): numbers in,
 * numbers out. It knows nothing about React or the theme, so the mapping is testable on
 * its own and the rail component only has to place what it returns.
 */

export type HourlyRailPoint = Readonly<{ x: number; y: number }>;

export type HourlyRailMetrics = Readonly<{
  /** Every column is the same width, so the series can pass through their centres. */
  columnWidth: number;
  columnGap: number;
  /** The card inset the rail's content is padded by on both sides. */
  inset: number;
  bandHeight: number;
  /** The temperature label's line box. It sits above its point, so the band keeps room for it. */
  labelHeight: number;
  /** The gap between a label's bottom edge and its point. */
  labelGap: number;
}>;

export type HourlyRailLayout = Readonly<{
  contentWidth: number;
  points: readonly HourlyRailPoint[];
  /** An `Svg` `Polyline` `points` string, empty when fewer than two hours are plotted. */
  polyline: string;
}>;

export function layoutHourlyRail(
  temperatures: readonly number[],
  { bandHeight, columnGap, columnWidth, inset, labelGap, labelHeight }: HourlyRailMetrics,
): HourlyRailLayout {
  const columns = temperatures.length;
  const contentWidth =
    inset * 2 + columns * columnWidth + Math.max(0, columns - 1) * columnGap;
  // The highest point still leaves room for its label above it; the lowest point keeps the
  // stroke inside the band.
  const top = labelHeight + labelGap;
  const bottom = bandHeight - labelGap;
  const minimum = Math.min(...temperatures);
  const maximum = Math.max(...temperatures);
  // A flat series has no range to map, so it sits on the band's centre line rather than
  // collapsing onto one of the padded edges.
  const isFlat = maximum === minimum;
  const points = temperatures.map((value, index) => ({
    x: inset + index * (columnWidth + columnGap) + columnWidth / 2,
    y: isFlat
      ? (top + bottom) / 2
      : bottom - ((value - minimum) / (maximum - minimum)) * (bottom - top),
  }));

  return {
    contentWidth,
    points,
    polyline: points.length < 2
      ? ''
      : points.map(({ x, y }) => `${x},${y}`).join(' '),
  };
}
