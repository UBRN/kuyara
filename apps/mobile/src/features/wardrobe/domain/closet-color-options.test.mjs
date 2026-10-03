import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  closetColorOptions,
  closetSolidSwatches,
  colorChoiceFamily,
  nearestFamilyForHex,
  normalizeCustomColorHex,
} from './closet-color-options.ts';

test('the approved palette keeps every permanent ID, hex, component order, and family', () => {
  const expectedSolids = [
    ['white', '#F4F3EE', 'white'],
    ['ecru', '#E8DEC8', 'beige'],
    ['stone', '#D0C3A8', 'beige'],
    ['sand', '#C8AE86', 'beige'],
    ['straw', '#D9C28E', 'beige'],
    ['camel', '#B7854D', 'brown'],
    ['tan_leather', '#96673C', 'brown'],
    ['chocolate', '#4E3526', 'brown'],
    ['light_grey', '#CACECE', 'gray'],
    ['heather_grey', '#A6AAAC', 'gray'],
    ['charcoal', '#3E434A', 'gray'],
    ['black', '#25272B', 'black'],
    ['navy', '#26334F', 'blue'],
    ['indigo_denim', '#33507A', 'blue'],
    ['mid_wash_denim', '#5A7DA7', 'blue'],
    ['light_wash_denim', '#9BB5D1', 'blue'],
    ['oxford_blue', '#BACFE3', 'blue'],
    ['sky_blue', '#93BDDF', 'blue'],
    ['cobalt', '#2F5BA6', 'blue'],
    ['black_denim', '#303338', 'black'],
    ['sage', '#93A88C', 'green'],
    ['olive', '#65663A', 'green'],
    ['forest_green', '#2F4E3E', 'green'],
    ['mustard', '#C7982F', 'yellow'],
    ['rain_yellow', '#E5BD2F', 'yellow'],
    ['terracotta', '#C26A46', 'orange'],
    ['rust', '#AE4F2B', 'orange'],
    ['tomato_red', '#C13C31', 'red'],
    ['burgundy', '#6B2534', 'red'],
    ['blush', '#E5C1BD', 'pink'],
    ['dusty_rose', '#CD9597', 'pink'],
    ['lavender', '#B7A6CF', 'purple'],
    ['plum', '#5B3A5E', 'purple'],
  ];
  const expectedOptions = [
    ['white_and_black', 'two-color', ['#F4F3EE', '#25272B'], 'white'],
    ['white_and_blue', 'two-color', ['#F4F3EE', '#2F5BA6'], 'white'],
    ['navy_and_camel', 'two-color', ['#26334F', '#B7854D'], 'blue'],
    ['blue_stripes', 'pattern', ['#F4F3EE', '#2F5BA6'], 'white'],
    ['navy_stripes', 'pattern', ['#F4F3EE', '#26334F'], 'white'],
    ['black_stripes', 'pattern', ['#F4F3EE', '#25272B'], 'white'],
    ['red_stripes', 'pattern', ['#F4F3EE', '#C13C31'], 'white'],
    ['blue_gingham', 'pattern', ['#F4F3EE', '#2F5BA6'], 'white'],
    ['red_gingham', 'pattern', ['#F4F3EE', '#C13C31'], 'white'],
    ['tartan', 'pattern', ['#C13C31', '#2F4E3E', '#26334F'], 'red'],
    ['houndstooth', 'pattern', ['#F4F3EE', '#25272B'], 'white'],
    ['polka_dots', 'pattern', ['#26334F', '#F4F3EE'], 'blue'],
    ['floral', 'pattern', ['#E5C1BD', '#C13C31', '#C7982F', '#93A88C'], 'pink'],
    ['leopard', 'pattern', ['#C8AE86', '#4E3526', '#B7854D'], 'beige'],
  ];
  assert.deepEqual(closetSolidSwatches.map(({ id, hex, family }) => [id, hex, family]), expectedSolids);
  assert.deepEqual(closetColorOptions.map(({ id, kind, hexes, family }) =>
    [id, kind, hexes, family]), expectedOptions);
  assert.equal(closetSolidSwatches.length, 33);
  assert.equal(closetColorOptions.length, 14);
  assert.equal(new Set([...closetSolidSwatches, ...closetColorOptions].map(({ id }) => id)).size, 47);
});

test('every solid exact hex maps to its family, including lowercase input', () => {
  for (const swatch of closetSolidSwatches) {
    assert.equal(nearestFamilyForHex(swatch.hex), swatch.family, swatch.id);
    assert.equal(nearestFamilyForHex(swatch.hex.toLowerCase()), swatch.family, swatch.id);
    assert.deepEqual(colorChoiceFamily({ kind: 'option', id: swatch.id }), swatch.family);
  }
  assert.equal(normalizeCustomColorHex('#aBcDeF'), '#ABCDEF');
  assert.throws(() => normalizeCustomColorHex('#abcd'));
  assert.throws(() => normalizeCustomColorHex('#12345678'));
});

test('fixed options derive the family of their first component', () => {
  for (const option of closetColorOptions) {
    assert.equal(option.family, nearestFamilyForHex(option.hexes[0]), option.id);
    assert.equal(colorChoiceFamily({ kind: 'option', id: option.id }), option.family);
  }
  assert.equal(colorChoiceFamily({ kind: 'option', id: 'blue_stripes' }), 'white');
  assert.equal(colorChoiceFamily({ kind: 'option', id: 'polka_dots' }), 'blue');
  assert.equal(colorChoiceFamily({ kind: 'option', id: 'tartan' }), 'red');
  assert.equal(colorChoiceFamily({ kind: 'option', id: 'floral' }), 'pink');
  assert.equal(colorChoiceFamily({ kind: 'option', id: 'leopard' }), 'beige');
});

test('custom primaries are deterministic and never resolve to multicolor', () => {
  for (const hex of ['#FF0000', '#00FF00', '#0000FF']) {
    const family = nearestFamilyForHex(hex);
    assert.notEqual(family, 'multicolor');
    assert.equal(colorChoiceFamily({ kind: 'custom', hex }), family);
  }
  assert.equal(nearestFamilyForHex('#000000'), 'black');
  assert.equal(nearestFamilyForHex('#FFFFFF'), 'white');
});

test('an equal-distance tie goes to the earlier swatch', () => {
  const first = closetSolidSwatches[0];
  assert.equal(nearestFamilyForHex(first.hex, [
    first, { ...first, id: 'same_hex_later', family: 'black' },
  ]), 'white');
});

test('Closet palette fields do not cross into recommendation, AI, analytics or Worker code', async () => {
  const mobileSrc = fileURLToPath(new URL('../../../', import.meta.url));
  const workerSrc = fileURLToPath(new URL('../../../../../worker/src/', import.meta.url));
  // The approved readers outside the Closet. The outfit detail draws the user's own
  // similar piece ("Yours") in its saved colour (O8), and the compose sheet paints a ticked
  // catalog piece in the solid the reader picks; the pick reaches composing only as a board
  // swatch id. Both render only; the rest of Today, recommendation, analytics and the Worker
  // stay free of the fields.
  const displayOnly = new Set([
    join(mobileSrc, 'features', 'today', 'presentation', 'outfit-detail-pieces.tsx'),
    join(mobileSrc, 'features', 'today', 'presentation', 'compose-sheet.tsx'),
  ]);
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (path === join(mobileSrc, 'features', 'wardrobe')) continue;
        await scan(path);
      } else if (!displayOnly.has(path) && /\.(?:ts|tsx|js|mjs)$/.test(entry.name) &&
          !/\.test\.(?:ts|tsx|js|mjs)$/.test(entry.name)) {
        const source = await readFile(path, 'utf8');
        assert.equal(/\b(?:colorChoice|colorOptionId|colorCustomHex|color_option_id|color_custom_hex)\b/.test(source), false, path);
      }
    }
  }
  for (const feature of ['recommendation', 'today', 'analytics']) {
    await scan(join(mobileSrc, 'features', feature));
  }
  await scan(workerSrc);
});
