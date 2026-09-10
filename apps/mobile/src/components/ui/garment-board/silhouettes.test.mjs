import assert from 'node:assert/strict';
import test from 'node:test';

import { silhouettes } from './silhouettes.ts';

// Authoring-time getBBox equivalent for this vocabulary only; stroke is excluded.
// Each quadratic/cubic curve is sampled at 64 steps, as required by the board spec.
function drawnBounds(paths) {
  const points = [];
  for (const { d } of paths) {
    const tokens = d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g);
    let index = 0;
    let cursor = [0, 0];
    let start = cursor;
    const point = () => [Number(tokens[index++]), Number(tokens[index++])];
    while (index < tokens.length) {
      const command = tokens[index++];
      if (command === 'M' || command === 'L') {
        cursor = point();
        if (command === 'M') start = cursor;
        points.push(cursor);
      } else if (command === 'Q' || command === 'C') {
        const from = cursor;
        const control = point();
        const control2 = command === 'C' ? point() : null;
        const end = point();
        for (let step = 1; step <= 64; step++) {
          const t = step / 64;
          const u = 1 - t;
          points.push(from.map((value, axis) => control2
            ? u ** 3 * value + 3 * u ** 2 * t * control[axis]
              + 3 * u * t ** 2 * control2[axis] + t ** 3 * end[axis]
            : u ** 2 * value + 2 * u * t * control[axis] + t ** 2 * end[axis]));
        }
        cursor = end;
      } else if (command === 'Z') {
        cursor = start;
        points.push(cursor);
      } else {
        assert.fail(`Unsupported silhouette path command: ${command}`);
      }
    }
  }
  const x = Math.min(...points.map(([x]) => x));
  const y = Math.min(...points.map(([, y]) => y));
  return {
    x,
    y,
    width: Math.max(...points.map(([x]) => x)) - x,
    height: Math.max(...points.map(([, y]) => y)) - y,
  };
}

test('the vocabulary contains exactly 27 garments and six category glyphs', () => {
  assert.equal(Object.keys(silhouettes).filter((id) => id.startsWith('g-cat-')).length, 6);
  assert.equal(Object.keys(silhouettes).length, 33);
});

test('every authored bound matches the drawn paths without stroke', () => {
  for (const [id, silhouette] of Object.entries(silhouettes)) {
    assert.equal(silhouette.id, id);
    assert.equal(silhouette.viewBox, 64);
    assert.deepEqual(drawnBounds(silhouette.paths), silhouette.bounds, id);
  }
});

test('accessory silhouettes stay inside the existing accessory-scale bounds range', () => {
  const accessoryIds = ['g-beanie', 'g-hat', 'g-scarf', 'g-gloves', 'g-umbrella'];
  const referenceIds = ['g-sneaker', 'g-sandal', 'g-boot', 'g-cat-accessory'];
  const referenceBounds = referenceIds.map((id) => silhouettes[id].bounds);
  const minWidth = Math.min(...referenceBounds.map(({ width }) => width));
  const maxWidth = Math.max(...referenceBounds.map(({ width }) => width));
  const minHeight = Math.min(...referenceBounds.map(({ height }) => height));
  const maxHeight = Math.max(...referenceBounds.map(({ height }) => height));

  assert.deepEqual(accessoryIds.filter((id) => {
    const { width, height } = silhouettes[id].bounds;
    return width < minWidth || width > maxWidth || height < minHeight || height > maxHeight;
  }), []);
});
