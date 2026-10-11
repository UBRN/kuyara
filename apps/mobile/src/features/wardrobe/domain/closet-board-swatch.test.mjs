import assert from 'node:assert/strict';
import test from 'node:test';

import { garmentSwatches } from '../../../garment-art/garment-palette.ts';
import { garmentSwatchIds } from '../../catalog/domain/garment-swatch.ts';
import {
  boardSwatchesInClosetOrder,
  boardSwatchForClosetItem,
  boardSwatchForClosetSolid,
  closetSolidForBoardSwatch,
} from './closet-board-swatch.ts';
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

test('every board swatch names its Closet solid back, and the board lists them in the Closet\'s order', () => {
  for (const { id } of closetSolidSwatches) {
    assert.equal(closetSolidForBoardSwatch(boardSwatchForClosetSolid(id)), id);
  }
  assert.deepEqual(boardSwatchesInClosetOrder, closetSolidSwatches.map(({ id }) => boardSwatchForClosetSolid(id)));
});

// A Closet piece worn on detail paints the board in a swatch History can store: a solid in its
// own swatch, a custom colour in the nearest one, and anything else in the first natural colour
// of its family, the drawing's own colourway first.
test('a Closet piece paints the board in the nearest swatch its colour allows', () => {
  const natural = ['navy', 'white', 'forest', 'ecru', 'skyblue', 'terracotta'];
  const piece = (colorChoice, colorFamily = null) => ({ colorChoice, colorFamily });
  assert.equal(boardSwatchForClosetItem(piece({ kind: 'option', id: 'tan_leather' }, 'brown'), natural), 'tan');
  assert.equal(boardSwatchForClosetItem(piece({ kind: 'custom', hex: '#27344E' }, 'blue'), natural), 'navy');
  assert.equal(boardSwatchForClosetItem(piece({ kind: 'option', id: 'navy_stripes' }, 'white'), natural), 'white');
  assert.equal(boardSwatchForClosetItem(piece({ kind: 'option', id: 'tartan' }, 'red'), natural), 'tomato');
  assert.equal(boardSwatchForClosetItem(piece(null, 'green'), natural), 'forest');
  assert.equal(boardSwatchForClosetItem(piece(undefined, null), natural), 'navy');
});
