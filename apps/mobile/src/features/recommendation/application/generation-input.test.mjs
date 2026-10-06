import assert from 'node:assert/strict';
import test from 'node:test';

import { generationInput } from './generation-input.ts';

const snapshot = { id: 'weather-one', locationKey: 'manual:sample.istanbul' };

function inputFor(overrides = {}) {
  return generationInput({
    weather: { status: 'ready', snapshot },
    clothingPreference: 'womens',
    day: { key: '2026-09-24', variant: 2, kind: 'weekday' },
    departureAt: null,
    dressStyle: 'smart',
    styleAesthetics: ['classic'],
    locale: 'en',
    now: () => '2026-09-24T09:00:00.000Z',
    ...overrides,
  });
}

test('ready weather and a clothing preference compose the generation input for the day', () => {
  assert.deepEqual(inputFor(), {
    snapshot,
    now: '2026-09-24T09:00:00.000Z',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    styleAesthetics: ['classic'],
    dayVariant: 2,
    dayKind: 'weekday',
    localDayKey: '2026-09-24',
    locale: 'en',
  });
});

test('a departure that shapes the day is part of the input, and none leaves the key out', () => {
  assert.equal(inputFor({ departureAt: '2026-09-24T15:00:00.000Z' }).departureAt, '2026-09-24T15:00:00.000Z');
  assert.equal('departureAt' in inputFor(), false);
});

test('nothing is composed, and the clock is not read, without ready weather or a clothing preference', () => {
  let reads = 0;
  const now = () => { reads += 1; return '2026-09-24T09:00:00.000Z'; };
  assert.equal(inputFor({ weather: { status: 'loading' }, now }), null);
  assert.equal(inputFor({ weather: { status: 'ready', snapshot: null }, now }), null);
  assert.equal(inputFor({ clothingPreference: null, now }), null);
  assert.equal(reads, 0);
});
