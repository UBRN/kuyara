import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shownTomorrowPreview,
  tomorrowOfEvening,
  tomorrowPreviewRequest,
} from './tomorrow-preview-request.ts';
import { getDeviceTimeZone } from '../../../domain/intl-format.ts';
import {
  localDayKey,
  localDayKind,
  localDayVariant,
  nextMorningAfterEvening,
  previewDepartureAt,
} from '../domain/local-day.ts';

// The evening is 19:00 on the device's own clock and the place keeps the device's zone, so the
// dressing day key and the weather window read the same hours under any device zone.
const deviceZone = getDeviceTimeZone();
const evening = new Date(2026, 9, 1, 19).toISOString();
const eveningKey = localDayKey(new Date(evening));
const morning = nextMorningAfterEvening(eveningKey);
const tomorrowKey = localDayKey(morning);
const afternoonKey = localDayKey(new Date(2026, 9, 1, 15));
const settledOutfits = [{ optionId: 'option-one' }];
const question = { dressStyle: 'smart', styleAesthetics: ['classic'] };

function weather(hours = 36) {
  const start = Date.parse(evening);
  return {
    id: 'weather-evening',
    locationKey: 'manual:sample.istanbul',
    timeZone: deviceZone,
    hourly: Array.from({ length: hours }, (_, index) =>
      ({ forecastAt: new Date(start + (index + 1) * 3600000).toISOString() })),
  };
}

function today(overrides = {}) {
  return {
    snapshot: weather(),
    now: evening,
    clothingPreference: 'womens',
    dressStyle: 'formal',
    styleAesthetics: [],
    localDayKey: eveningKey,
    ...overrides,
  };
}

function ask(overrides = {}) {
  return {
    dressingDayKey: eveningKey,
    wanted: true,
    eveningChoicePending: false,
    today: today(),
    settledOutfits,
    question,
    locale: 'en',
    now: () => evening,
    ...overrides,
  };
}

test('an evening previews the next morning once the place zone is known', () => {
  assert.deepEqual(tomorrowOfEvening(eveningKey, today()), { morning, key: tomorrowKey });
  assert.equal(tomorrowOfEvening(eveningKey, null), null);
  assert.equal(tomorrowOfEvening(afternoonKey, today({ localDayKey: afternoonKey })), null);
});

test('a wanted, answered, settled evening with tomorrow forecast asks for the preview', () => {
  assert.deepEqual(tomorrowPreviewRequest(ask()), {
    snapshot: today().snapshot,
    now: evening,
    departureAt: previewDepartureAt(eveningKey, deviceZone),
    clothingPreference: 'womens',
    dressStyle: 'smart',
    styleAesthetics: ['classic'],
    dayVariant: localDayVariant(morning),
    dayKind: localDayKind(morning),
    localDayKey: tomorrowKey,
    locale: 'en',
    excludedOutfits: settledOutfits,
  });
});

test('the preview is not asked for before every condition holds', () => {
  assert.equal(tomorrowPreviewRequest(ask({ wanted: false })), null);
  assert.equal(tomorrowPreviewRequest(ask({ eveningChoicePending: true })), null);
  assert.equal(tomorrowPreviewRequest(ask({ settledOutfits: null })), null);
  assert.equal(tomorrowPreviewRequest(ask({ today: null })), null);
  assert.equal(tomorrowPreviewRequest(ask({ dressingDayKey: afternoonKey })), null);
  assert.equal(tomorrowPreviewRequest(ask({ today: today({ snapshot: weather(12) }) })), null);
});

test('the clock is read only when the preview is asked for', () => {
  let reads = 0;
  const now = () => { reads += 1; return evening; };
  tomorrowPreviewRequest(ask({ wanted: false, now }));
  assert.equal(reads, 0);
  tomorrowPreviewRequest(ask({ now }));
  assert.equal(reads, 1);
});

test('a stored preview shows only while it answers tomorrow\'s question', () => {
  const preview = {
    localDayKey: tomorrowKey,
    locationKey: 'manual:sample.istanbul',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    styleAesthetics: ['classic'],
  };
  assert.equal(shownTomorrowPreview(preview, eveningKey, today(), question), preview);
  assert.equal(shownTomorrowPreview(null, eveningKey, today(), question), null);
  assert.equal(shownTomorrowPreview(preview, eveningKey, null, question), null);
  assert.equal(shownTomorrowPreview(preview, afternoonKey, today(), question), null);
  assert.equal(shownTomorrowPreview(preview, eveningKey, today(),
    { ...question, dressStyle: 'casual' }), null);
  assert.equal(shownTomorrowPreview(preview, eveningKey,
    today({ snapshot: { ...weather(), locationKey: 'manual:other' } }), question), null);
});
