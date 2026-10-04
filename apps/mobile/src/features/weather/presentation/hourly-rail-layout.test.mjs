import assert from 'node:assert/strict';
import test from 'node:test';

import { HOURLY_LABEL_GAP, hourlyRailMetrics, layoutHourlyRail } from './hourly-rail-layout.ts';

const metrics = {
  columnGap: 4,
  columnWidth: 52,
  inset: 16,
  labelHeight: 20,
  plotHeight: 40,
};

// The label row sits above the plot, and the plot keeps a dot margin at both ends.
const plotTop = metrics.labelHeight + HOURLY_LABEL_GAP;
const top = plotTop + 6;
const bottom = plotTop + metrics.plotHeight - 6;
const centre = (top + bottom) / 2;

test('the band is the label row, its gap and the plot', () => {
  assert.equal(layoutHourlyRail([18, 19], metrics).bandHeight, plotTop + metrics.plotHeight);
});

test('a single hour draws no curve and centres its dot in the plot', () => {
  const layout = layoutHourlyRail([18], metrics);

  assert.equal(layout.path, '');
  assert.deepEqual(layout.points, [{ x: 16 + 26, y: centre }]);
  assert.equal(layout.contentWidth, 16 * 2 + 52);
});

test('a flat series sits on the centre of the plot and its curve stays flat', () => {
  const layout = layoutHourlyRail([12, 12, 12], metrics);

  assert.deepEqual(layout.points.map(({ y }) => y), [centre, centre, centre]);
  assert.equal(
    layout.path,
    `M42,${centre} C51.33,${centre} 79.33,${centre} 98,${centre} C116.67,${centre} 144.67,${centre} 154,${centre}`,
  );
});

test('a rising series moves up the plot, so y decreases', () => {
  const { points } = layoutHourlyRail([10, 12, 15, 21], metrics);

  for (let index = 1; index < points.length; index += 1) {
    assert.ok(
      points[index].y < points[index - 1].y,
      `point ${index} should sit above point ${index - 1}`,
    );
  }
});

test('the series minimum and maximum land exactly on the padded plot edges', () => {
  const { points } = layoutHourlyRail([14, 9, 22, 17], metrics);

  assert.equal(points[1].y, bottom);
  assert.equal(points[2].y, top);
  // Every label rides above its dot, so the highest one still starts inside the band.
  assert.ok(top - metrics.labelHeight - 6 >= 0);
  const half = layoutHourlyRail([0, 10, 20], metrics);
  assert.equal(half.points[1].y, (top + bottom) / 2);
});

test('the curve passes through every hour and starts on the first dot', () => {
  const layout = layoutHourlyRail([14, 9, 22, 17], metrics);
  const segments = layout.path.split(' C');

  assert.equal(segments.length, 4);
  const at = (value) => Math.round(value * 100) / 100;
  assert.equal(segments[0], `M${at(layout.points[0].x)},${at(layout.points[0].y)}`);
  layout.points.slice(1).forEach((point, index) => {
    assert.ok(segments[index + 1].endsWith(` ${at(point.x)},${at(point.y)}`));
  });
});

test('columns are evenly spaced and the content width counts the gaps between them', () => {
  const hours = Array.from({ length: 25 }, (_, index) => index);
  const layout = layoutHourlyRail(hours, metrics);

  assert.equal(
    layout.contentWidth,
    metrics.inset * 2 + 25 * metrics.columnWidth + 24 * metrics.columnGap,
  );
  assert.equal(layout.points[0].x, metrics.inset + metrics.columnWidth / 2);
  assert.equal(
    layout.points[24].x,
    layout.contentWidth - metrics.inset - metrics.columnWidth / 2,
  );
});

test('each label sits just above its own dot, clear of the dot and its stroke', () => {
  const layout = layoutHourlyRail([12, 18], metrics);

  assert.deepEqual(layout.labelTops, layout.points.map(({ y }) => y - metrics.labelHeight - 6));
  // The warmest label stays inside the band: it starts at the band's top edge or below.
  assert.ok(Math.min(...layout.labelTops) >= 0);
});

test('the default text size gives the 52-point column at a 56-point pitch', () => {
  assert.deepEqual(hourlyRailMetrics(1, { columnGap: 4, inset: 16 }), metrics);
});

test('larger text widens the column and grows the plot only up to its cap', () => {
  const large = hourlyRailMetrics(2, { columnGap: 4, inset: 16 });

  assert.equal(large.columnWidth, Math.round(52 * 2 * 0.92));
  assert.equal(large.labelHeight, 40);
  assert.equal(large.plotHeight, 50);
  // A smaller text size never narrows the column below the default.
  assert.equal(hourlyRailMetrics(0.8, { columnGap: 4, inset: 16 }).columnWidth, 52);
});

test('the layout names its temperature axis, so the line can be coloured along it', () => {
  const layout = layoutHourlyRail([14, 9, 22, 17], metrics);

  assert.equal(layout.minimumCelsius, 9);
  assert.equal(layout.maximumCelsius, 22);
  assert.equal(layout.yAtMinimum, bottom);
  assert.equal(layout.yAtMaximum, top);
});

test('a flat series names one temperature at one height', () => {
  const layout = layoutHourlyRail([12, 12, 12], metrics);

  assert.equal(layout.minimumCelsius, 12);
  assert.equal(layout.maximumCelsius, 12);
  assert.equal(layout.yAtMinimum, centre);
  assert.equal(layout.yAtMaximum, centre);
});
