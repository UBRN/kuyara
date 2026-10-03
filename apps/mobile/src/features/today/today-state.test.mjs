import assert from 'node:assert/strict';
import test from 'node:test';

import { todayActiveLocation, todayScreenState, todayWeatherSnapshot } from './__tests__/fixtures.ts';
import { classifyTodayState, paletteBasisOf } from './application/today-state.ts';
import { todayFreshness } from './model.ts';

function weather(overrides = {}) {
  return {
    status: 'ready',
    activeLocation: todayActiveLocation,
    snapshot: null,
    freshness: null,
    permission: { kind: 'undetermined' },
    locationFlow: 'idle',
    isSelectingLocation: false,
    isRefreshing: false,
    refreshFailure: null,
    ...overrides,
  };
}

function classify(weatherState, surface = 'today') {
  return classifyTodayState({
    weather: weatherState,
    recommendation: {
      status: 'ready', snapshot: null, isRefreshing: false, lastFailure: null,
      phase: null, exhausted: false, showFirstGenerationOverlay: false,
    },
    profile: { status: 'loading' },
    surface,
    ...(surface === 'detail' ? { now: '2026-08-13T06:10:00.000Z' } : {}),
  });
}

test('the first weather fetch with no snapshot yet reads as loading, not unavailable', () => {
  for (const surface of ['today', 'detail']) {
    const fetching = classify(weather({ isRefreshing: true }), surface);
    assert.equal(fetching.state.kind, 'loading');
    assert.equal(fetching.todayFailure, undefined);
    const selecting = classify(weather({ isSelectingLocation: true }), surface);
    assert.equal(selecting.state.kind, 'loading');
  }
});

test('no snapshot with a settled failure or no fetch in flight stays unavailable', () => {
  const failed = classify(weather({ refreshFailure: 'offline' }));
  assert.equal(failed.state.kind, 'unavailable');
  assert.equal(failed.todayFailure, 'offline');
  const failedWhileRetrying = classify(weather({ refreshFailure: 'offline', isRefreshing: true }));
  assert.equal(failedWhileRetrying.state.kind, 'unavailable');
  assert.equal(classify(weather()).state.kind, 'unavailable');
});

// The detail surface measures freshness against the instant its route hands in:
// five minutes after the fetch reads fresh, thirty-one minutes after reads stale.
test('the detail surface reads freshness against the given now, not the ambient clock', () => {
  const loaded = (now) => classifyTodayState({
    weather: weather({
      snapshot: todayWeatherSnapshot,
      activeLocation: { ...todayActiveLocation, locationKey: todayWeatherSnapshot.locationKey },
      freshness: 'stale',
    }),
    recommendation: {
      status: 'ready',
      snapshot: {
        locationKey: todayWeatherSnapshot.locationKey,
        recommendation: todayScreenState.snapshot.recommendation,
      },
      isRefreshing: false, lastFailure: null, phase: null, exhausted: false,
      showFirstGenerationOverlay: false,
    },
    profile: { status: 'loading' },
    surface: 'detail',
    now,
  });
  const fresh = loaded('2026-08-13T06:10:00.000Z');
  assert.equal(fresh.state.kind, 'loaded');
  assert.equal(fresh.state.snapshot.freshness, 'fresh');
  assert.equal(loaded('2026-08-13T06:36:00.000Z').state.snapshot.freshness, 'stale');
});

test('only a fresh weather shows as fresh', () => {
  assert.equal(todayFreshness('fresh'), 'fresh');
  assert.equal(todayFreshness('stale'), 'stale');
  assert.equal(todayFreshness('invalid'), 'stale');
  assert.equal(todayFreshness(null), 'stale');
});

test('the palette basis is the stored palette weather with its day, or none', () => {
  const paletteWeather = { temperatureC: 12, condition: 'rain' };
  assert.deepEqual(paletteBasisOf({ paletteWeather, localDayKey: '2026-08-13' }),
    { temperatureC: 12, condition: 'rain', localDayKey: '2026-08-13' });
  assert.deepEqual(paletteBasisOf({ paletteWeather, localDayKey: null }),
    { temperatureC: 12, condition: 'rain', localDayKey: null });
  assert.equal(paletteBasisOf({ localDayKey: '2026-08-13' }), undefined);
  assert.equal(paletteBasisOf(null), undefined);
});
