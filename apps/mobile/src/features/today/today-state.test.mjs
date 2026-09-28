import assert from 'node:assert/strict';
import test from 'node:test';

import { todayActiveLocation } from './__tests__/fixtures.ts';
import { classifyTodayState } from './application/today-state.ts';

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
