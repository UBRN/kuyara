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
import { resolveGarmentRenderFills } from './garment-render-fills.ts';

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

// HSL hue in degrees: the accent is the anchor's hue carried to another luminance, so two
// planes give the same outfit the same hue at two different values.
function hue(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255);
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  if (high === low) return 0;
  const span = high - low;
  const degrees = high === r
    ? ((g - b) / span + (g < b ? 6 : 0))
    : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return degrees * 60;
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

// One board of one of each kind: an outer layer to take the accent, footwear to take the
// deeper neutral, and a bottom to stay on the base.
const boardPieces = [
  { slot: 'outer_layer', colorFamily: null },
  { slot: 'bottom', colorFamily: null },
  { slot: 'footwear', colorFamily: null },
];

// The seven hue anchors are private to the module, so they are read back through the seed
// rather than copied here: a hundred option ids reach every bucket of a 7-wide index.
function accentsOn({ plane, colors, colorScheme }) {
  const accents = new Map();
  for (let index = 0; index < 100; index += 1) {
    const fills = resolveGarmentRenderFills({
      optionId: `option-${index}`,
      pieces: boardPieces,
      plane,
      colors,
      colorScheme,
    });
    accents.set(fills.get('outer_layer'), `option-${index}`);
  }
  return accents;
}

test('garment board fills step off every plane without weakening the outline', (context) => {
  let worstStep = Infinity;
  let worstOutline = Infinity;

  for (const { appearance, state, plane, colors } of [...stages, ...grounds]) {
    const stroke = colors.textPrimary;
    const base = blend(plane, stroke, 0.13);
    const deep = blend(plane, stroke, 0.22);
    const fills = resolveGarmentRenderFills({
      optionId: '',
      pieces: boardPieces,
      plane,
      colors,
      colorScheme: appearance,
    });

    assert.equal(fills.get('bottom'), base);
    assert.equal(fills.get('footwear'), deep);

    const accents = accentsOn({ plane, colors, colorScheme: appearance });
    assert.equal(accents.size, 7, `${appearance} ${state} reached ${accents.size} anchors`);

    const cells = [['base', base], ['deep', deep], ...[...accents.keys()].map((fill) => ['accent', fill])];
    for (const [name, fill] of cells) {
      const step = contrast(fill, plane);
      const outline = contrast(stroke, fill);
      worstStep = Math.min(worstStep, step);
      worstOutline = Math.min(worstOutline, outline);
      assert.ok(step >= 1.2, `${appearance} ${state} ${name} ${fill} step ${step.toFixed(3)}:1`);
      assert.ok(outline >= 3, `${appearance} ${state} ${name} ${fill} outline ${outline.toFixed(3)}:1`);
    }

    context.diagnostic(`${appearance} ${state} | ${plane} | ${base} | ${deep}`);
  }

  context.diagnostic(`worst step ${worstStep.toFixed(3)}:1, worst outline ${worstOutline.toFixed(3)}:1`);
});

test('the accent is a deterministic function of the option id and of nothing else', () => {
  const stage = lightTheme.atmosphere.fallingNight;
  const of = (optionId, plane) => resolveGarmentRenderFills({
    optionId,
    pieces: boardPieces,
    plane,
    colors: lightTheme.colors,
    colorScheme: 'light',
  });

  assert.deepEqual([...of('outfit-a', stage)], [...of('outfit-a', stage)]);
  assert.notEqual(
    of('outfit-a', stage).get('outer_layer'),
    of('outfit-b', stage).get('outer_layer'),
  );
  // Today's tinted stage and the detail's page ground are two planes, so the same outfit
  // keeps its hue on both while each fill still steps off the plane it stands on.
  const onStage = of('outfit-a', stage).get('outer_layer');
  const onGround = of('outfit-a', lightTheme.colors.background).get('outer_layer');
  assert.notEqual(onStage, onGround);
  assert.ok(
    Math.abs(hue(onStage) - hue(onGround)) < 1,
    `${onStage} at ${hue(onStage).toFixed(1)} degrees, ${onGround} at ${hue(onGround).toFixed(1)}`,
  );
});

test('a board carries at most three values and exactly one accent', () => {
  const fills = resolveGarmentRenderFills({
    optionId: 'outfit-a',
    pieces: [...boardPieces, { slot: 'primary_top', colorFamily: null }, { slot: 'mid_layer', colorFamily: null }],
    plane: lightTheme.colors.background,
    colors: lightTheme.colors,
    colorScheme: 'light',
  });
  const base = blend(lightTheme.colors.background, lightTheme.colors.textPrimary, 0.13);

  assert.equal(new Set(fills.values()).size, 3);
  assert.equal([...fills.values()].filter((fill) => fill === base).length, 3);
  // The accent takes the outermost body piece an outfit has, so `primary_top` keeps the
  // base while an outer layer is present.
  assert.equal(fills.get('primary_top'), base);
  assert.notEqual(fills.get('outer_layer'), base);
});

test('an outfit without an accent slot and a Closet tile both stay neutral', () => {
  const plane = lightTheme.colors.background;
  const base = blend(plane, lightTheme.colors.textPrimary, 0.13);
  const resolve = (optionId, pieces) => resolveGarmentRenderFills({
    optionId, pieces, plane, colors: lightTheme.colors, colorScheme: 'light',
  });

  assert.deepEqual(
    [...resolve('outfit-a', [{ slot: 'bottom', colorFamily: null }]).values()],
    [base],
  );
  // The Closet and the Profile rail call with an empty option id: a recorded colour wins,
  // and a piece without one is drawn neutral rather than guessed at.
  assert.deepEqual(
    [...resolve('', [{ slot: 'primary_top', colorFamily: null }]).values()],
    [base],
  );
  assert.deepEqual(
    [...resolve('', [{ slot: 'primary_top', colorFamily: 'blue' }]).values()],
    [colorFamilyFills.light.blue],
  );
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
