import assert from 'node:assert/strict';
import test from 'node:test';

import { garmentSwatches } from '../../../garment-art/garment-palette.ts';
import { garmentSwatchIds } from '../../catalog/domain/garment-swatch.ts';
import { boardSwatchForClosetSolid } from './closet-board-swatch.ts';
import { closetColorOptions, closetSolidSwatches } from './closet-color-options.ts';

test('all 33 Closet solids paint on the board, each in its own swatch, in the same colour', () => {
  assert.equal(closetSolidSwatches.length, 33);
  const mapped = closetSolidSwatches.map(({ id }) => boardSwatchForClosetSolid(id));
  assert.ok(mapped.every((id) => id !== null));
  assert.equal(new Set(mapped).size, 33, 'no two solids share a swatch');
  assert.deepEqual(new Set(mapped), new Set(garmentSwatchIds), 'every board swatch is reachable');
  for (const { id, hex, family } of closetSolidSwatches) {
    const swatch = garmentSwatches[boardSwatchForClosetSolid(id)];
    assert.equal(swatch.hex, hex, id);
    assert.equal(swatch.fam, family, id);
  }
});

test('thirteen ids are renames, the rest keep their id', () => {
  const renamed = closetSolidSwatches.filter(({ id }) => boardSwatchForClosetSolid(id) !== id);
  assert.equal(renamed.length, 13);
  assert.equal(boardSwatchForClosetSolid('tan_leather'), 'tan');
  assert.equal(boardSwatchForClosetSolid('forest_green'), 'forest');
});

test('patterns, two-colour options and unknown ids have no swatch', () => {
  for (const { id } of closetColorOptions) assert.equal(boardSwatchForClosetSolid(id), null, id);
  for (const id of ['', 'neon', 'constructor', 'toString']) assert.equal(boardSwatchForClosetSolid(id), null, id);
});
