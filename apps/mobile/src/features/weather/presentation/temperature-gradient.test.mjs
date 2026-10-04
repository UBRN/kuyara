import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { resolveCardFill } from '../../../components/ui/primitive-contracts.ts';
import { garmentPaletteContrast as contrastRatio } from '../../../components/ui/garment-board/garment-palette.ts';
import { toOklch } from '../../../theme/color-oklch.ts';
import { brandColors, darkTheme, lightTheme } from '../../../theme/theme.ts';
import { temperatureScaleStopsCelsius } from '../domain/temperature-scale.ts';
import { temperatureColor, temperatureStops } from './temperature-gradient.ts';

const themes = [lightTheme, darkTheme];
const halfDegrees = Array.from({ length: 81 }, (_, index) => -5 + index / 2);

// The floor each ramp clears against both planes it is drawn on: the card the hourly line
// and the daily rows sit on, and the muted track each capsule lies in.
const floors = {
  light: { standard: 3, strong: 4.5 },
  dark: { standard: 4.5, strong: 7 },
};

for (const theme of themes) {
  const card = resolveCardFill(theme);
  const track = theme.colors.surfaceMuted;

  for (const strength of ['standard', 'strong']) {
    const ramp = theme.temperature[strength];

    test(`${theme.colorScheme} ${strength}: every half degree clears its floor on the card and the track`, (context) => {
      const floor = floors[theme.colorScheme][strength];
      let lowest = Infinity;
      for (const celsius of halfDegrees) {
        const colour = temperatureColor(ramp, celsius);
        for (const [plane, ground] of [['card', card], ['track', track]]) {
          const ratio = contrastRatio(colour, ground);
          lowest = Math.min(lowest, ratio);
          assert.ok(ratio >= floor, `${celsius} C ${colour} on the ${plane}: ${ratio.toFixed(3)}:1 < ${floor}:1`);
        }
      }
      context.diagnostic(`lowest ${lowest.toFixed(3)}:1`);
    });

    test(`${theme.colorScheme} ${strength}: seven stops, muted chroma, and the hue each stop was taken from`, () => {
      assert.equal(ramp.length, temperatureScaleStopsCelsius.length);
      for (const celsius of halfDegrees) {
        assert.ok(toOklch(temperatureColor(ramp, celsius)).C <= 0.135, `${celsius} C is too saturated`);
      }
      const sources = [
        theme.condition.heavyRain, brandColors.quietSky, theme.condition.partlyCloudyDay,
        theme.condition.fog, theme.condition.clearDay, theme.condition.mostlyClearDay, theme.colors.dangerInk,
      ];
      ramp.forEach((stop, index) => {
        const turn = Math.abs(toOklch(stop).H - toOklch(sources[index]).H);
        assert.ok(Math.min(turn, 360 - turn) <= 8, `stop ${index} ${stop} left the hue of ${sources[index]}`);
      });
    });
  }

  // Today's dot is the primary ink with a ring in the card's own fill.
  test(`${theme.colorScheme}: the now dot reads against its ring, and the ring against every capsule colour`, () => {
    assert.ok(contrastRatio(theme.colors.textPrimary, card) >= 7);
    for (const strength of ['standard', 'strong']) {
      for (const celsius of halfDegrees) {
        assert.ok(contrastRatio(card, temperatureColor(theme.temperature[strength], celsius)) >= 3);
      }
    }
  });
}

test('the scale\'s stops are the ramp\'s own colours', () => {
  const ramp = lightTheme.temperature.standard;
  temperatureScaleStopsCelsius.forEach((celsius, index) => {
    assert.equal(temperatureColor(ramp, celsius), ramp[index]);
  });
  assert.equal(temperatureColor(ramp, -20), ramp[0]);
  assert.equal(temperatureColor(ramp, 41), ramp[6]);
});

test('a capsule runs from its low at 0 to its high at 1, with a stop at every whole degree', () => {
  const ramp = lightTheme.temperature.standard;
  const stops = temperatureStops(ramp, 12.4, 16.6);
  const between = (celsius) => (celsius - 12.4) / (16.6 - 12.4);

  assert.deepEqual(stops.map(({ offset }) => offset), [0, between(13), between(14), between(15), between(16), 1]);
  assert.equal(stops[0].color, temperatureColor(ramp, 12.4));
  assert.equal(stops.at(-1).color, temperatureColor(ramp, 16.6));
});

test('a temperature has one colour on every row, wherever it falls in the capsule', () => {
  const ramp = darkTheme.temperature.strong;
  const colourOf = (stops, low, high, celsius) => stops.find(({ offset }) => (
    Math.abs(low + offset * (high - low) - celsius) < 1e-9
  )).color;

  assert.equal(
    colourOf(temperatureStops(ramp, 9, 17), 9, 17, 15),
    colourOf(temperatureStops(ramp, 13, 25), 13, 25, 15),
  );
});

test('a day with no spread, and a flat axis, is one colour', () => {
  const ramp = lightTheme.temperature.standard;
  assert.deepEqual(temperatureStops(ramp, 18, 18), [{ offset: 0, color: ramp[3] }]);
});

test('the hourly axis runs from its maximum at the top to its minimum at the bottom', () => {
  const ramp = lightTheme.temperature.standard;
  const stops = temperatureStops(ramp, 22.5, 18);

  assert.deepEqual(stops.map(({ offset }) => offset), [0, 0.5 / 4.5, 1.5 / 4.5, 2.5 / 4.5, 3.5 / 4.5, 1]);
  assert.equal(stops[0].color, temperatureColor(ramp, 22.5));
  assert.equal(stops.at(-1).color, ramp[3]);
});

// Like `condition.*`, the ramps are a closed content encoding with exactly two readers.
test('only the daily outlook and the hourly rail read the temperature ramps, never through alpha', async () => {
  const sourceRoot = new URL('../../../', import.meta.url);
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  const hexes = themes.flatMap((theme) => [...theme.temperature.standard, ...theme.temperature.strong]);
  const consumers = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
    const path = `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/');
    if (path.endsWith('/theme/theme.ts')) continue;
    const source = await readFile(path, 'utf8');
    for (const hex of hexes) {
      assert.equal(source.toUpperCase().includes(hex), false, `${path} spells the temperature colour ${hex}`);
    }
    if (/\.temperature\s*[.[]|\{[^}]*\btemperature\b[^}]*\}\s*=\s*\w*[Tt]heme\b/.test(source)) {
      consumers.push(path.split('/src/').pop());
      assert.equal(source.includes('withAlpha'), false, `${path} fades a temperature colour`);
    }
  }
  assert.deepEqual(consumers.sort(), [
    'features/weather/presentation/daily-outlook.tsx',
    'features/weather/presentation/hourly-rail.tsx',
  ]);
});
