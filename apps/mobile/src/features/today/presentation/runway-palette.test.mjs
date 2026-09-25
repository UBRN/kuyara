import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import { weatherConditionCodes } from '../../weather/domain/weather.ts';
import { darkTheme, lightTheme } from '../../../theme/theme.ts';
import { clampRunwayFill, contrastRatio, resolveRunwayFills } from '../../../components/ui/garment-board/runway-fills.ts';
import { runwayField, runwayParticleInks, runwayParticleKind } from './runway-palette.ts';

const fields = ['clear', 'cloudy', 'rain', 'snow'];
const themes = [lightTheme, darkTheme];

test('the eight runway fields are the O1 values', () => {
  assert.deepEqual(lightTheme.runway, { clear: '#F1DDA8', cloudy: '#C7D0DD', rain: '#7FB1CC', snow: '#D5E5EE' });
  assert.deepEqual(darkTheme.runway, { clear: '#1B3350', cloudy: '#1C2B37', rain: '#0E3A52', snow: '#193344' });
});

test('every condition resolves to a field and a particle kind; an unreadable one stays quiet', () => {
  for (const condition of weatherConditionCodes) {
    assert.ok(fields.includes(runwayField(condition)), condition);
    assert.ok(runwayParticleKind(condition), condition);
  }
  assert.equal(runwayField('rain'), 'rain');
  assert.equal(runwayField('thunderstorm'), 'rain');
  assert.equal(runwayField('mostly_clear'), 'clear');
  assert.equal(runwayField('fog'), 'cloudy');
  assert.equal(runwayField('snow'), 'snow');
  assert.equal(runwayField(null), 'cloudy');
  assert.equal(runwayField('volcanic_ash'), 'cloudy');
  assert.equal(runwayParticleKind('volcanic_ash'), null);
});

for (const theme of themes) {
  test(`${theme.colorScheme}: the drafts, the dressed outline and the text read on every field`, () => {
    for (const field of fields) {
      const plane = theme.runway[field];
      // The neutral draft's plain outline, and the dressed garments' outline (non-text, 3:1).
      assert.ok(contrastRatio(theme.colors.iconSecondary, plane) >= 3, `draft on ${field}`);
      assert.ok(contrastRatio(theme.colors.textPrimary, plane) >= 3, `outline on ${field}`);
      // The heading and the body line (text, 4.5:1).
      assert.ok(contrastRatio(theme.colors.textPrimary, plane) >= 4.5, `text on ${field}`);
    }
  });

  test(`${theme.colorScheme}: particles wear the full condition ink, flat and opaque`, () => {
    assert.equal(runwayParticleInks(theme, 'rain', 'day').ink, theme.condition.rain);
    assert.equal(runwayParticleInks(theme, 'snow', 'night').ink, theme.condition.snow);
    assert.equal(runwayParticleInks(theme, 'clear', 'night').ink, theme.condition.clearNight);
    assert.equal(runwayParticleInks(theme, 'clear', null).ink, theme.condition.clearDay);
    assert.equal(runwayParticleInks(theme, 'clear', 'day').sparkle, theme.isDark ? null : theme.colors.surface);
    assert.equal(runwayParticleInks(theme, 'rain', 'day').sparkle, null);
  });

  test(`${theme.colorScheme}: every dressed fill separates from every field`, () => {
    const slots = ['primary_top', 'bottom', 'outer_layer', 'footwear'];
    for (const field of fields) {
      const plane = theme.runway[field];
      for (let option = 0; option < 40; option += 1) {
        const fills = resolveRunwayFills({
          optionId: `option-${option}`, slots, field: plane, colors: theme.colors, colorScheme: theme.colorScheme,
        });
        for (const fill of fills.values()) {
          const step = contrastRatio(fill, plane);
          const passes = step >= 3 || (step >= 1.2 && contrastRatio(theme.colors.textPrimary, fill) >= 3);
          assert.ok(passes, `${field} option-${option} ${fill}`);
        }
      }
    }
  });
}

test('the clamp moves exactly the four colliding fills O1 measured, lightness only', () => {
  const ink = lightTheme.colors.textPrimary;
  assert.equal(clampRunwayFill('#5F686C', '#7FB1CC', ink), '#525B5F');
  assert.equal(clampRunwayFill('#D99A94', '#7FB1CC', ink), '#C88B85');
  assert.equal(clampRunwayFill('#E5B48F', '#C7D0DD', ink), '#E3B28D');
  assert.equal(clampRunwayFill('#E3D4BC', '#C7D0DD', ink), '#F0E1C9');
  // A passing fill never moves: dark `white` clears the fill-alone route on every dark field.
  for (const field of Object.values(darkTheme.runway)) {
    assert.equal(clampRunwayFill('#C9D1D3', field, darkTheme.colors.textPrimary), '#C9D1D3');
  }
});

test('only the runway reads the runway field tokens', async () => {
  const sourceRoot = new URL('../../../', import.meta.url);
  const entries = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  const hexes = [...Object.values(lightTheme.runway), ...Object.values(darkTheme.runway)];
  const consumers = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
    const path = `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/');
    if (path.endsWith('/theme/theme.ts')) continue;
    const source = await readFile(path, 'utf8');
    for (const hex of hexes) {
      assert.equal(source.toUpperCase().includes(hex), false, `${path} spells the runway field ${hex}`);
    }
    if (/\.runway\b|\{[^}]*\brunway\b[^}]*\}\s*=/.test(source)) consumers.push(path.split('/src/').pop());
  }
  assert.deepEqual(consumers, ['features/today/presentation/first-generation-runway.tsx']);
});
