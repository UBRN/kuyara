import assert from 'node:assert/strict';
import test from 'node:test';

import { weatherConditionCodes } from '@/features/weather/domain/weather';
import {
  localHourOf,
  resolveAtmosphereState,
} from './atmosphere-state.ts';

const familyByCondition = {
  clear: 'clear',
  mostly_clear: 'clear',
  partly_cloudy: 'veiled',
  cloudy: 'veiled',
  fog: 'veiled',
  drizzle: 'falling',
  rain: 'falling',
  heavy_rain: 'falling',
  sleet: 'falling',
  snow: 'falling',
  thunderstorm: 'falling',
};

test('every weather condition resolves in both dayparts', () => {
  assert.deepEqual(Object.keys(familyByCondition), [...weatherConditionCodes]);

  for (const condition of weatherConditionCodes) {
    const family = familyByCondition[condition];
    assert.equal(resolveAtmosphereState(condition, 6), `${family}Day`);
    assert.equal(resolveAtmosphereState(condition, 20), `${family}Night`);
  }
});

test('day begins at 06:00 and night begins at 20:00 in the snapshot time zone', () => {
  assert.equal(localHourOf('2026-08-13T03:00:00.000Z', 'Europe/Istanbul'), 6);
  assert.equal(localHourOf('2026-08-13T16:59:59.000Z', 'Europe/Istanbul'), 19);
  assert.equal(localHourOf('2026-08-13T17:00:00.000Z', 'Europe/Istanbul'), 20);
  assert.equal(resolveAtmosphereState('clear', 5), 'clearNight');
  assert.equal(resolveAtmosphereState('clear', 6), 'clearDay');
  assert.equal(resolveAtmosphereState('clear', 19), 'clearDay');
  assert.equal(resolveAtmosphereState('clear', 20), 'clearNight');
});

test('unknown or invalid inputs resolve safely to neutral', () => {
  assert.equal(resolveAtmosphereState('future_condition', 12), 'neutral');
  assert.equal(resolveAtmosphereState('toString', 12), 'neutral');
  assert.equal(resolveAtmosphereState('rain', null), 'neutral');
  assert.equal(resolveAtmosphereState('rain', 24), 'neutral');
  assert.equal(localHourOf('not-a-timestamp', 'Europe/Istanbul'), null);
  assert.equal(localHourOf('2026-08-13T03:00:00.000Z', 'Not/AZone'), null);
});
