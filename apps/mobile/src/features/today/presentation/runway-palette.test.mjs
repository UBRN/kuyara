import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAtmosphereState } from '../domain/atmosphere-state.ts';
import { weatherConditionCodes } from '../../weather/domain/weather.ts';
import { darkTheme, lightTheme } from '../../../theme/theme.ts';
import { runwayParticleColor } from './runway-palette.ts';

function luminance(hex) {
  const channel = (start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

// Visible but atmospheric. The floor is Law 3's garment fill step, 1.20:1, the smallest
// step off a plane the design language measures as perceptible, so a particle reads at least
// as clearly as a fill does. The ceiling stays under the 3:1 non-text threshold that the
// garment outlines clear, so the weather never reads as loudly as the pieces it frames.
const FLOOR = 1.2;
const CEILING = 3;

for (const theme of [lightTheme, darkTheme]) {
  test(`runway particles stay between ${FLOOR}:1 and ${CEILING}:1 on every ${theme.colorScheme} atmosphere`, () => {
    for (const daypart of ['day', 'night', null]) {
      for (const condition of weatherConditionCodes) {
        const plane = theme.atmosphere[resolveAtmosphereState(condition, daypart)];
        const ratio = contrast(plane, runwayParticleColor(theme, plane, condition));
        const label = `${theme.colorScheme} ${condition} ${daypart}: ${ratio.toFixed(2)}:1`;
        assert.ok(ratio >= FLOOR, label);
        assert.ok(ratio < CEILING, label);
      }
    }
  });
}
