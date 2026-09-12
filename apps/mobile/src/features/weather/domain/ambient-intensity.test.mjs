import assert from 'node:assert/strict';
import test from 'node:test';

import { standardMotion } from '@/theme/theme';
import { ambientIntensityOf } from './ambient-intensity.ts';
import { weatherConditionCodes } from './weather.ts';

const expectedIntensity = {
  clear: 'calm',
  mostly_clear: 'calm',
  partly_cloudy: 'calm',
  cloudy: 'calm',
  fog: 'calm',
  drizzle: 'moderate',
  rain: 'intense',
  heavy_rain: 'intense',
  sleet: 'intense',
  snow: 'intense',
  thunderstorm: 'intense',
};

test('every weather condition maps to one ambient intensity step', () => {
  assert.deepEqual(Object.keys(expectedIntensity), [...weatherConditionCodes]);

  for (const condition of weatherConditionCodes) {
    const intensity = ambientIntensityOf(condition);
    assert.equal(intensity, expectedIntensity[condition]);
    assert.ok(intensity in standardMotion.ambient);
  }
});
