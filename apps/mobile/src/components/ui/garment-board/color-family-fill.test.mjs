import assert from 'node:assert/strict';
import test from 'node:test';

import { colorFamilies } from '../../../features/catalog/domain/garment-taxonomy.ts';
import { blend } from '../../../theme/color-blend.ts';
import {
  darkSemanticColors,
  darkTheme,
  lightSemanticColors,
  lightTheme,
} from '../../../theme/theme.ts';
import { colorFamilyFills } from './color-family-fill.ts';
import { NEUTRAL_GARMENT_FILL, resolveGarmentTileFill } from './garment-render-fills.ts';

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

// The eight planes a board may stand on: the seven light atmosphere states of Today's
// stage plus the dark stage, which collapses to one value under ADR 0018's ceiling.
const stages = [
  ...Object.entries(lightTheme.atmosphere).map(([state, plane]) => ({
    appearance: 'light',
    state,
    plane,
    colors: lightTheme.colors,
  })),
  {
    appearance: 'dark',
    state: 'neutral',
    plane: darkTheme.atmosphere.neutral,
    colors: darkTheme.colors,
  },
];

// The detail plate and the alternates stand on the page ground instead, which the spec's
// eight cells never covered. They clear the same two thresholds.
const grounds = [lightTheme, darkTheme].map((theme) => ({
  appearance: theme.colorScheme,
  state: 'page ground',
  plane: theme.colors.background,
  colors: theme.colors,
}));

// A drawing without a palette (a Closet record with no colour, a day-type tile) takes the
// neutral step; it must clear both floors on every plane a drawing stands on.
test('the neutral garment fill steps off every plane without weakening the outline', (context) => {
  for (const { appearance, state, plane, colors } of [...stages, ...grounds]) {
    const fill = resolveGarmentTileFill({ colorFamily: null, plane, colors, colorScheme: appearance });
    assert.equal(fill, blend(plane, colors.textPrimary, NEUTRAL_GARMENT_FILL));
    const fillStep = contrast(fill, plane);
    const outline = contrast(colors.textPrimary, fill);
    assert.ok(fillStep >= 1.2, `${appearance} ${state} ${fill} step ${fillStep.toFixed(3)}:1`);
    assert.ok(outline >= 3, `${appearance} ${state} ${fill} outline ${outline.toFixed(3)}:1`);
    context.diagnostic(`${appearance} ${state} | ${plane} | ${fill}`);
  }
});

test('a recorded colour family wins and a record without one is never guessed at', () => {
  const plane = lightTheme.colors.background;
  const resolve = (colorFamily) => resolveGarmentTileFill({
    colorFamily, plane, colors: lightTheme.colors, colorScheme: 'light',
  });
  assert.equal(resolve(null), blend(plane, lightTheme.colors.textPrimary, 0.13));
  assert.equal(resolve('blue'), colorFamilyFills.light.blue);
  assert.deepEqual(resolve('multicolor'), colorFamilyFills.light.multicolor);
});

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
