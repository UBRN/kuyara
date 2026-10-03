import assert from 'node:assert/strict';
import test from 'node:test';

import { wholeWindSpeed, windSpeedUnitFor } from './wind-speed.ts';

test('US customary devices read miles an hour, every other system kilometres an hour', () => {
  assert.equal(windSpeedUnitFor('us'), 'milesPerHour');
  for (const system of ['metric', 'uk', null, undefined, 'junk', 'toString', 1]) {
    assert.equal(windSpeedUnitFor(system), 'kilometresPerHour', String(system));
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
