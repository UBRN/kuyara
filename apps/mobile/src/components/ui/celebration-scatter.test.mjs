import assert from 'node:assert/strict';
import test from 'node:test';

import { celebrationScatter, celebrationShapes, stitchSegments } from './celebration-scatter.ts';

const days = ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];

test('a day scatters its burst the same way every time, and another day differently', () => {
  assert.deepEqual(celebrationScatter('2026-10-11'), celebrationScatter('2026-10-11'));
  assert.notDeepEqual(celebrationScatter('2026-10-11'), celebrationScatter('2026-10-12'));
});

test('a burst is 18 to 24 small garment shapes thrown upward within 60 degrees of straight up', () => {
  for (const day of days) {
    const pieces = celebrationScatter(day);
    assert.ok(pieces.length >= 18 && pieces.length <= 24, `${day}: ${pieces.length}`);
    for (const piece of pieces) {
      assert.ok(celebrationShapes.includes(piece.shape));
      assert.ok(Math.abs(piece.angle) <= Math.PI / 3);
      for (const unit of [piece.rise, piece.size, piece.color]) assert.ok(unit >= 0 && unit < 1);
    }
  }
  assert.deepEqual(new Set(days.flatMap((day) => celebrationScatter(day).map(({ shape }) => shape))),
    new Set(celebrationShapes));
});

test('the stitch runs once around the rounded plate, its segments adding up to the perimeter', () => {
  const [width, height, inset, radius] = [358, 420, 8, 18];
  const segments = stitchSegments(width, height, inset, radius);
  const perimeter = 2 * (width - 2 * inset) + 2 * (height - 2 * inset) - 8 * radius + 2 * Math.PI * radius;
  const total = segments.reduce((sum, { length }) => sum + length, 0);
  assert.ok(Math.abs(total - perimeter) < 1e-9);
  assert.deepEqual([segments[0].x0, segments[0].y0], [inset + radius, inset]);
});
