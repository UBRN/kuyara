import assert from 'node:assert/strict';
import test from 'node:test';

import { weatherAlertOfferState } from './weather-alert-offer.ts';

const now = '2026-09-09T08:00:00.000Z';
const crossingAt = '2026-09-09T10:00:00.000Z';

function measurements(overrides = {}) {
  return {
    temperatureCelsius: 20,
    apparentTemperatureCelsius: 20,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 0,
    humidity: 0.5,
    uvIndex: 0,
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    localProfileId: 'profile-one',
    locationKey: 'manual:sample.istanbul',
    timeZone: 'UTC',
    fetchedAt: now,
    current: { observedAt: now, ...measurements() },
    origin: { kind: 'sample', sourceId: 'offer-test' },
    minimumTemperatureCelsius: 20,
    maximumTemperatureCelsius: 21,
    hourly: [{ forecastAt: crossingAt, ...measurements() }],
    ...overrides,
  };
}

const rainySnapshot = snapshot({
  hourly: [{ forecastAt: crossingAt, ...measurements({ precipitationProbability: 0.6 }) }],
});

const coldingSnapshot = snapshot({
  hourly: [{ forecastAt: crossingAt, ...measurements({ apparentTemperatureCelsius: 11 }) }],
});

function offerState(overrides = {}) {
  return weatherAlertOfferState({
    optedIn: false,
    alreadyOffered: false,
    snapshot: rainySnapshot,
    now,
    timeZone: 'UTC',
    ...overrides,
  });
}

test('an alert that would have fired today is offered, by its rule', () => {
  assert.deepEqual(offerState(), { kind: 'offer', ruleId: 'precipitation_onset' });
  assert.deepEqual(
    offerState({ snapshot: coldingSnapshot }),
    { kind: 'offer', ruleId: 'temperature_swing' },
  );
});

test('a day with no crossing and no reachable morning offers nothing', () => {
  assert.deepEqual(offerState({ snapshot: snapshot() }), { kind: 'none' });
});

// ADR 0004: the briefing is planned every day, so the offer stops waiting for a rare rule
// crossing and arrives on the first fresh open whose window reaches tomorrow morning.
test('a snapshot that reaches tomorrow morning offers the briefing', () => {
  const withTomorrow = snapshot({
    hourly: [
      { forecastAt: crossingAt, ...measurements() },
      { forecastAt: '2026-09-10T07:00:00.000Z', ...measurements() },
    ],
  });

  assert.deepEqual(
    offerState({ snapshot: withTomorrow }),
    { kind: 'offer', ruleId: 'morning_briefing' },
  );
  // An alert is about the next few hours, so a day that has both is named by the alert.
  assert.deepEqual(
    offerState({
      snapshot: {
        ...withTomorrow,
        hourly: [
          { forecastAt: crossingAt, ...measurements({ precipitationProbability: 0.6 }) },
          { forecastAt: '2026-09-10T07:00:00.000Z', ...measurements() },
        ],
      },
    }),
    { kind: 'offer', ruleId: 'precipitation_onset' },
  );
});

test('nothing is offered to someone already opted in, or already offered', () => {
  assert.deepEqual(offerState({ optedIn: true }), { kind: 'none' });
  assert.deepEqual(offerState({ alreadyOffered: true }), { kind: 'none' });
  assert.deepEqual(offerState({ optedIn: true, alreadyOffered: true }), { kind: 'none' });
});

test('no snapshot, and a snapshot too old to plan from, offer nothing', () => {
  assert.deepEqual(offerState({ snapshot: null }), { kind: 'none' });
  assert.deepEqual(
    offerState({ snapshot: { ...rainySnapshot, fetchedAt: '2026-09-09T07:29:00.000Z' } }),
    { kind: 'none' },
  );
  assert.deepEqual(
    offerState({ snapshot: { ...rainySnapshot, fetchedAt: '2026-09-09T07:31:00.000Z' } }),
    { kind: 'offer', ruleId: 'precipitation_onset' },
  );
});

test('the offer follows the alert rules, including quiet hours and the lead time', () => {
  // The alert would have fired at 22:30, inside quiet hours, and the 30 minute budget
  // reaches no quiet-free minute before the crossing, so it would have been dropped.
  const lateEvening = '2026-09-09T22:00:00.000Z';
  assert.deepEqual(offerState({
    now: lateEvening,
    snapshot: snapshot({
      fetchedAt: lateEvening,
      current: { observedAt: lateEvening, ...measurements() },
      hourly: [{
        forecastAt: '2026-09-09T23:30:00.000Z',
        ...measurements({ precipitationProbability: 0.9 }),
      }],
    }),
  }), { kind: 'none' });

  // A crossing closer than the 60 minute lead is past the moment an alert would have fired.
  assert.deepEqual(offerState({ now: '2026-09-09T09:30:00.000Z' }), { kind: 'none' });
});
