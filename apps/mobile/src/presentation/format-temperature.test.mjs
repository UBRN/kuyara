import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTemperature,
  formatTemperatureValue,
  localeTag,
} from './format-temperature.ts';

test('the locale tag maps the two supported languages and nothing else', () => {
  assert.equal(localeTag('en'), 'en-GB');
  assert.equal(localeTag('tr'), 'tr-TR');
});

test('English reads the point and Turkish the comma', () => {
  assert.equal(formatTemperature(16.34, 'en'), '16.3°');
  assert.equal(formatTemperature(16.34, 'tr'), '16,3°');
  assert.equal(formatTemperature(-10.55, 'en'), '-10.6°');
  assert.equal(formatTemperature(-10.55, 'tr'), '-10,6°');
});

test('an integer still carries its one decimal', () => {
  assert.equal(formatTemperature(16, 'en'), '16.0°');
  assert.equal(formatTemperature(16, 'tr'), '16,0°');
  assert.equal(formatTemperature(0, 'en'), '0.0°');
  assert.equal(formatTemperature(-3, 'tr'), '-3,0°');
});

test('a half step rounds away from zero', () => {
  assert.equal(formatTemperature(22.45, 'en'), '22.5°');
  assert.equal(formatTemperature(0.05, 'en'), '0.1°');
  assert.equal(formatTemperature(-0.05, 'tr'), '-0,1°');
  assert.equal(formatTemperature(-22.45, 'en'), '-22.5°');
});

test('a value that rounds away to nothing loses its sign, one that does not keeps it', () => {
  assert.equal(formatTemperature(-0.04, 'en'), '0.0°');
  assert.equal(formatTemperature(-0.04, 'tr'), '0,0°');
  assert.equal(formatTemperature(-0, 'en'), '0.0°');
  assert.equal(formatTemperature(-0.4, 'tr'), '-0,4°');
  assert.equal(formatTemperature(-0.4, 'en'), '-0.4°');
});

test('the bare value is the same number without the degree sign', () => {
  assert.equal(formatTemperatureValue(16.34, 'tr'), '16,3');
  assert.equal(formatTemperatureValue(-0.04, 'en'), '0.0');
  assert.equal(`${formatTemperatureValue(7, 'en')}°`, formatTemperature(7, 'en'));
});
