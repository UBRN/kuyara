import assert from 'node:assert/strict';
import test from 'node:test';

import { aiRecommendV2RequestSchema } from '@kuyara/contracts';

import { messages } from '../localization/messages.ts';
import {
  isTemperatureUnitPreference,
  isWindSpeedUnitPreference,
  supportedLanguages,
  temperatureUnitPreferences,
  windSpeedUnitPreferences,
} from './preferences.ts';

test('the supported languages are the ones the app has messages for and a request may name', () => {
  assert.deepEqual([...supportedLanguages].sort(), Object.keys(messages).sort());
  assert.deepEqual([...supportedLanguages].sort(), [...aiRecommendV2RequestSchema.shape.locale.options].sort());
});

test('unit choices are closed, locale-independent values with System first', () => {
  assert.deepEqual(temperatureUnitPreferences, ['system', 'celsius', 'fahrenheit']);
  assert.deepEqual(windSpeedUnitPreferences, ['system', 'kmh', 'mph']);
  for (const value of temperatureUnitPreferences) assert.equal(isTemperatureUnitPreference(value), true);
  for (const value of windSpeedUnitPreferences) assert.equal(isWindSpeedUnitPreference(value), true);
  for (const value of ['kmh', 'Celsius', '', null, undefined, 'toString']) {
    assert.equal(isTemperatureUnitPreference(value), false, String(value));
  }
  for (const value of ['celsius', 'KMH', 'mps', '', null, undefined, 'toString']) {
    assert.equal(isWindSpeedUnitPreference(value), false, String(value));
  }
});
