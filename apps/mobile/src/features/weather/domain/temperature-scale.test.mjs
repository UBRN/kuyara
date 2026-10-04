import assert from 'node:assert/strict';
import test from 'node:test';

import { temperatureScalePosition, temperatureScaleStopsCelsius } from './temperature-scale.ts';
import { chillyCelsius, freezingCelsius, hotCelsius, veryHotCelsius } from './weather-thresholds.ts';

test('the scale stops on the clothing thresholds between its two fixed ends', () => {
  assert.deepEqual(
    temperatureScaleStopsCelsius,
    [-5, freezingCelsius, 12, chillyCelsius, hotCelsius, veryHotCelsius, 35],
  );
});

test('each stop sits on its own whole index and a temperature between two stops between them', () => {
  temperatureScaleStopsCelsius.forEach((celsius, index) => {
    assert.equal(temperatureScalePosition(celsius), index);
  });
  assert.equal(temperatureScalePosition(15), 2.5);
  assert.equal(temperatureScalePosition(0), 0.5);
});

test('the position rises with the temperature and holds still past both ends', () => {
  let previous = -Infinity;
  for (let celsius = -5; celsius <= 35; celsius += 0.5) {
    const position = temperatureScalePosition(celsius);
    assert.ok(position > previous, `${celsius} should sit past ${previous}`);
    previous = position;
  }
  assert.equal(temperatureScalePosition(-30), 0);
  assert.equal(temperatureScalePosition(48), temperatureScaleStopsCelsius.length - 1);
  assert.equal(temperatureScalePosition(Number.NaN), 0);
});

test('the scale takes a Celsius value and nothing else: no unit reaches it', () => {
  assert.equal(temperatureScalePosition.length, 1);
});
