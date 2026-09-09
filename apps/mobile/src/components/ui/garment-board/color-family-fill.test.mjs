import assert from 'node:assert/strict';
import test from 'node:test';

import { colorFamilies } from '../../../features/catalog/domain/garment-taxonomy.ts';
import { darkSemanticColors, lightSemanticColors } from '../../../theme/theme.ts';
import { colorFamilyFills } from './color-family-fill.ts';

// Same sRGB linearization and contrast calculation as theme.test.mjs.
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

for (const [appearance, colors] of Object.entries({ light: lightSemanticColors, dark: darkSemanticColors })) {
  const fills = colorFamilyFills[appearance];
  test(`${appearance}: every colour family has a fill and multicolor has exactly two blue-to-yellow stops`, () => {
    assert.deepEqual(Object.keys(fills).sort(), [...colorFamilies].sort());
    assert.deepEqual(fills.multicolor, [fills.blue, fills.yellow]);
    for (const fill of Object.values(fills).flat()) assert.match(fill, /^#[0-9A-F]{6}$/);
  });
  for (const family of colorFamilies.filter((family) => family !== 'multicolor')) {
    const ink = contrast(colors.textPrimary, fills[family]);
    const ground = contrast(fills[family], colors.surfaceMuted);
    test(`${appearance} ${family}: textPrimary/fill ${ink.toFixed(3)}:1; fill/surfaceMuted ${ground.toFixed(3)}:1`, () => {
      assert.ok(ink >= 1.5 || ground >= 1.5);
    });
  }
}
