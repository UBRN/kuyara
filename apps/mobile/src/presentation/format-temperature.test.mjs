import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTemperature,
  formatTemperatureValue,
  formatTemperatureDifference,
  formatWholeTemperature,
  formatWholeTemperatureRange,
} from './format-temperature.ts';

test('English reads the point and Turkish the comma', () => {
  assert.equal(formatTemperature(16.34, 'en', 'celsius'), '16.3°');
  assert.equal(formatTemperature(16.34, 'tr', 'celsius'), '16,3°');
  assert.equal(formatTemperature(-10.55, 'en', 'celsius'), '-10.6°');
  assert.equal(formatTemperature(-10.55, 'tr', 'celsius'), '-10,6°');
});

test('an integer still carries its one decimal', () => {
  assert.equal(formatTemperature(16, 'en', 'celsius'), '16.0°');
  assert.equal(formatTemperature(16, 'tr', 'celsius'), '16,0°');
  assert.equal(formatTemperature(0, 'en', 'celsius'), '0.0°');
  assert.equal(formatTemperature(-3, 'tr', 'celsius'), '-3,0°');
});

test('a half step rounds away from zero', () => {
  assert.equal(formatTemperature(22.45, 'en', 'celsius'), '22.5°');
  assert.equal(formatTemperature(0.05, 'en', 'celsius'), '0.1°');
  assert.equal(formatTemperature(-0.05, 'tr', 'celsius'), '-0,1°');
  assert.equal(formatTemperature(-22.45, 'en', 'celsius'), '-22.5°');
});

test('a value that rounds away to nothing loses its sign, one that does not keeps it', () => {
  assert.equal(formatTemperature(-0.04, 'en', 'celsius'), '0.0°');
  assert.equal(formatTemperature(-0.04, 'tr', 'celsius'), '0,0°');
  assert.equal(formatTemperature(-0, 'en', 'celsius'), '0.0°');
  assert.equal(formatTemperature(-0.4, 'tr', 'celsius'), '-0,4°');
  assert.equal(formatTemperature(-0.4, 'en', 'celsius'), '-0.4°');
});

test('the bare value is the same number without the degree sign', () => {
  assert.equal(formatTemperatureValue(16.34, 'tr', 'celsius'), '16,3');
  assert.equal(formatTemperatureValue(-0.04, 'en', 'celsius'), '0.0');
  assert.equal(`${formatTemperatureValue(7, 'en', 'celsius')}°`, formatTemperature(7, 'en', 'celsius'));
});

test('Fahrenheit converts before formatting, including values around zero', () => {
  assert.equal(formatTemperature(20, 'en', 'fahrenheit'), '68.0°');
  assert.equal(formatTemperature(-17.78, 'en', 'fahrenheit'), '0.0°');
  assert.equal(formatTemperature(-18, 'en', 'fahrenheit'), '-0.4°');
  assert.equal(formatTemperature(20, 'tr', 'fahrenheit'), '68,0°');
});

test('a temperature difference scales without adding 32', () => {
  assert.equal(formatTemperatureDifference(8, 'en', 'fahrenheit'), '14.4°');
  assert.equal(formatTemperatureDifference(8, 'tr', 'celsius'), '8,0°');
});

test('whole-degree notifications convert then round without negative zero', () => {
  assert.equal(formatWholeTemperature(-17.78, 'en', 'fahrenheit'), '0°F');
  assert.equal(formatWholeTemperature(20, 'tr', 'fahrenheit'), '68°F');
  assert.equal(formatWholeTemperature(-0.4, 'en', 'celsius'), '0°C');
});

test('a whole-degree range reads with a dash above zero and in words once it starts below zero', () => {
  assert.equal(formatWholeTemperatureRange(14, 22, 'en', 'celsius'), '14–22°C');
  assert.equal(formatWholeTemperatureRange(-5, -2, 'en', 'celsius'), '-5 to -2°C');
  assert.equal(formatWholeTemperatureRange(-5, -2, 'tr', 'celsius'), '-5 ile -2°C');
  assert.equal(formatWholeTemperatureRange(-3, 4, 'en', 'celsius'), '-3 to 4°C');
  assert.equal(formatWholeTemperatureRange(-3, -3, 'en', 'celsius'), '-3°C');
  assert.equal(formatWholeTemperatureRange(-5, -2, 'en', 'fahrenheit'), '23–28°F');
  assert.equal(formatWholeTemperatureRange(-30, -20, 'en', 'fahrenheit'), '-22 to -4°F');
});
