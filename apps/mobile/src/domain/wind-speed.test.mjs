import assert from 'node:assert/strict';
import test from 'node:test';

import { wholeWindSpeed, windSpeedUnitFor } from './wind-speed.ts';

// The stored choice wins; System follows the device's measurement system as the OS formats it.
// Apple's Foundation formats a speed in mph for en_GB (Locale.measurementSystem `uk`) and in km/h
// for metric locales, as CLDR's speed preferences list mile-per-hour for GB and US.
test('every wind choice on every device measurement system', () => {
  const systemUnit = { metric: 'kilometresPerHour', us: 'milesPerHour', uk: 'milesPerHour' };
  for (const [system, unit] of Object.entries(systemUnit)) {
    assert.equal(windSpeedUnitFor('system', system), unit, `system on ${system}`);
    assert.equal(windSpeedUnitFor('kmh', system), 'kilometresPerHour', `kmh on ${system}`);
    assert.equal(windSpeedUnitFor('mph', system), 'milesPerHour', `mph on ${system}`);
  }
});

test('System on an unknown or missing measurement system reads kilometres an hour', () => {
  for (const system of [null, undefined, 'junk', 'toString', 1]) {
    assert.equal(windSpeedUnitFor('system', system), 'kilometresPerHour', String(system));
  }
});

test('metres per second convert, then round to a whole number in either unit', () => {
  assert.equal(wholeWindSpeed(4, 'kilometresPerHour'), 14);
  assert.equal(wholeWindSpeed(4, 'milesPerHour'), 9);
  assert.equal(wholeWindSpeed(0, 'milesPerHour'), 0);
  // 0.125 m/s is 0.45 km/h and 0.28 mph: both stay at zero.
  assert.equal(wholeWindSpeed(0.125, 'kilometresPerHour'), 0);
  assert.equal(wholeWindSpeed(0.125, 'milesPerHour'), 0);
  // Either side of the half: 0.69 m/s is 2.48 km/h, 0.7 m/s is 2.52 km/h;
  // 1.11 m/s is 2.48 mph, 1.12 m/s is 2.51 mph.
  assert.equal(wholeWindSpeed(0.69, 'kilometresPerHour'), 2);
  assert.equal(wholeWindSpeed(0.7, 'kilometresPerHour'), 3);
  assert.equal(wholeWindSpeed(1.11, 'milesPerHour'), 2);
  assert.equal(wholeWindSpeed(1.12, 'milesPerHour'), 3);
  assert.equal(wholeWindSpeed(10, 'milesPerHour'), 22);
});
