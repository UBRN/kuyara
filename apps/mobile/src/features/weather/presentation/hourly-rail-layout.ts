/**
 * The geometry of the hourly rail's temperature series (ADR 0021 section 9, O14 rail A):
 * numbers in, numbers out. It knows nothing about React or the theme, so the mapping is
 * testable on its own and the rail component only has to place what it returns.
 */

export type HourlyRailPoint = Readonly<{ x: number; y: number }>;

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

export type HourlyRailMetrics = Readonly<{
  /** Every column is the same width, so the series can pass through their centres. */
  columnWidth: number;
  columnGap: number;
  /** The card inset the rail's content is padded by on both sides. */
  inset: number;
  /** The temperature label's line box. Each label rides above its own dot. */
  labelHeight: number;
  /** The plot under the labels, where the curve and its dots live. */
  plotHeight: number;
}>;

export type HourlyRailLayout = Readonly<{
  contentWidth: number;
  /** The label row, the gap under it and the plot: the band a column reserves. */
  bandHeight: number;
  points: readonly HourlyRailPoint[];
  /** Where each temperature label's top sits in the band: just above its own dot. */
  labelTops: readonly number[];
  /** An `Svg` `Path` `d` string, a smooth curve through every point; empty below two. */
  path: string;
}>;

/** The space between a label and the plot under it. */
export const HOURLY_LABEL_GAP = 4;
/** How far a label's bottom sits above its own dot's centre, clear of the dot and stroke. */
const LABEL_LIFT = 6;
// The plot keeps the largest dot (the first, 4.5 plus its 2-point stroke) inside it at both
// extremes, so no dot is clipped at the top or bottom of the band.
const DOT_MARGIN = 6;

/** The rail's column and plot sizes at the reader's text scale; the spacing comes from the theme. */
export function hourlyRailMetrics(
  fontScale: number,
  { columnGap, inset }: Readonly<{ columnGap: number; inset: number }>,
): HourlyRailMetrics {
  return {
    columnGap,
    columnWidth: Math.round(COLUMN_WIDTH * Math.max(1, fontScale * COLUMN_GROWTH)),
    inset,
    labelHeight: TEMPERATURE_LABEL_HEIGHT * fontScale,
    plotHeight: Math.round(PLOT_HEIGHT * Math.min(fontScale, PLOT_GROWTH_CAP)),
  };
}

export function layoutHourlyRail(
  temperatures: readonly number[],
  { columnGap, columnWidth, inset, labelHeight, plotHeight }: HourlyRailMetrics,
): HourlyRailLayout {
  const columns = temperatures.length;
  const contentWidth =
    inset * 2 + columns * columnWidth + Math.max(0, columns - 1) * columnGap;
  const plotTop = labelHeight + HOURLY_LABEL_GAP;
  const top = plotTop + DOT_MARGIN;
  const bottom = plotTop + plotHeight - DOT_MARGIN;
  const minimum = Math.min(...temperatures);
  const maximum = Math.max(...temperatures);
  // A flat series has no range to map, so it sits on the plot's centre line rather than
  // collapsing onto one of the padded edges.
  const isFlat = maximum === minimum;
  const points = temperatures.map((value, index) => ({
    x: inset + index * (columnWidth + columnGap) + columnWidth / 2,
    y: isFlat
      ? (top + bottom) / 2
      : bottom - ((value - minimum) / (maximum - minimum)) * (bottom - top),
  }));

  return {
    bandHeight: plotTop + plotHeight,
    contentWidth,
    labelTops: points.map(({ y }) => y - labelHeight - LABEL_LIFT),
    path: smoothPath(points),
    points,
  };
}

// Catmull-Rom through every point, written as cubic Béziers: the curve passes exactly
// through each hour's dot and never overshoots between two equal neighbours.
function smoothPath(points: readonly HourlyRailPoint[]): string {
  if (points.length < 2) {
    return '';
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  let path = `M${round(points[0].x)},${round(points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const start = points[index];
    const end = points[index + 1];
    const next = points[index + 2] ?? end;
    path += ` C${round(start.x + (end.x - previous.x) / 6)},${round(start.y + (end.y - previous.y) / 6)}`
      + ` ${round(end.x - (next.x - start.x) / 6)},${round(end.y - (next.y - start.y) / 6)}`
      + ` ${round(end.x)},${round(end.y)}`;
  }
  return path;
}
