import assert from 'node:assert/strict';
import test from 'node:test';

import { layoutHourlyRail } from './hourly-rail-layout.ts';

const metrics = {
  bandHeight: 64,
  columnGap: 8,
  columnWidth: 64,
  inset: 16,
  labelGap: 4,
  labelHeight: 24,
};

// The highest point leaves its label's box and gap above it; the lowest keeps the stroke
// inside the band.
const top = metrics.labelHeight + metrics.labelGap;
const bottom = metrics.bandHeight - metrics.labelGap;
const centre = (top + bottom) / 2;

test('a single hour draws no polyline and centres its label', () => {
  const layout = layoutHourlyRail([18], metrics);

  assert.equal(layout.polyline, '');
  assert.deepEqual(layout.points, [{ x: 16 + 32, y: centre }]);
  assert.equal(layout.contentWidth, 16 * 2 + 64);
});

test('a flat series sits on the centre of the padded band', () => {
  const layout = layoutHourlyRail([12, 12, 12], metrics);

  assert.deepEqual(layout.points.map(({ y }) => y), [centre, centre, centre]);
  assert.equal(layout.polyline, `48,${centre} 120,${centre} 192,${centre}`);
});

test('a rising series moves up the band, so y decreases', () => {
  const { points } = layoutHourlyRail([10, 12, 15, 21], metrics);

  for (let index = 1; index < points.length; index += 1) {
    assert.ok(
      points[index].y < points[index - 1].y,
      `point ${index} should sit above point ${index - 1}`,
    );
  }
});

test('the series minimum and maximum land exactly on the padded band edges', () => {
  const { points } = layoutHourlyRail([14, 9, 22, 17], metrics);

  assert.equal(points[1].y, bottom);
  assert.equal(points[2].y, top);
  // The midpoint of the range lands on the midpoint of the padded band.
  const half = layoutHourlyRail([0, 10, 20], metrics);
  assert.equal(half.points[1].y, (top + bottom) / 2);
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
  assert.equal(layout.polyline.split(' ').length, 25);
});
