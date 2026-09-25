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

// ADR 0025's 33 drawings plus the eight Phase 6 additions: 41 garments, and six category glyphs.
const additions = ['x-polo', 'x-turtleneck', 'x-blouse', 'x-bomber', 'x-leather', 'x-coat', 'x-loafer', 'x-rainboot'];

test('the vocabulary contains exactly 41 garments and six category glyphs', () => {
  const ids = Object.keys(silhouettes);
  assert.equal(ids.filter((id) => id.startsWith('g-cat-')).length, 6);
  assert.equal(ids.filter((id) => !id.startsWith('g-cat-')).length, 41);
  for (const id of additions) assert.ok(silhouettes[id], id);
});

test('every authored bound matches the drawn outlines without stroke', () => {
  for (const [id, silhouette] of Object.entries(silhouettes)) {
    assert.equal(silhouette.id, id);
    assert.equal(silhouette.viewBox, 64);
    const measured = drawnBounds(silhouette.groups.map(({ outline }) => ({ d: outline })));
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(measured[key] - silhouette.bounds[key]) <= 0.005, `${id} ${key}`);
    }
  }
});

// Style A: flat fills from the piece's own roles, no gradient, no alpha, no body. A drawing
// names only colour roles, never a colour, and every part stays inside the 64 viewBox.
test('drawings are role-painted data with no colour, gradient or opacity of their own', () => {
  const kinds = new Set(['fs', 'fl', 'fk', 'fa', 'fas', 'fm', 'fh', 'D', 'Dh', 'T', 'Ta', 'S', 'Sh', 'Sa']);
  const roles = new Set(['main', 'shade', 'toneLine', 'darkTrim', 'material', 'hardware']);
  for (const [id, silhouette] of Object.entries(silhouettes)) {
    assert.ok(silhouette.groups.length > 0, id);
    for (const group of silhouette.groups) {
      assert.ok(roles.has(group.fill), `${id} ${group.fill}`);
      for (const [kind, d] of group.parts) {
        assert.ok(kinds.has(kind), `${id} ${kind}`);
        assert.match(d, /^[MLQAZ0-9 .-]+$/, id);
      }
    }
  }
});
