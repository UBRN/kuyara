import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvedTriggerAwaitsWeatherRefresh,
  createApprovedTriggerEvaluation,
  firstOutfitAwaitsWeatherRefresh,
} from './approved-trigger-evaluation.ts';
import { garmentCatalogVersion } from '../../catalog/domain/garment-catalog.ts';

const dayKey = '2026-08-01';

function inputFor(overrides = {}) {
  return {
    snapshot: { id: 'weather-one', locationKey: 'manual:sample.istanbul' },
    clothingPreference: 'womens',
    dressStyle: 'smart',
    styleAesthetics: [],
    localDayKey: dayKey,
    now: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

// The persisted recommendation the input above would have produced.
function persistedFor(overrides = {}) {
  return {
    weatherSnapshotId: 'weather-one',
    locationKey: 'manual:sample.istanbul',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    styleAesthetics: [],
    catalogVersion: garmentCatalogVersion,
    localDayKey: dayKey,
    ...overrides,
  };
}

function recordingRecommendation(snapshot) {
  const calls = [];
  return {
    calls,
    recommendation: {
      getSnapshot: () => ({ status: 'ready', snapshot }),
      refresh: async (trigger, input) => { calls.push(['refresh', trigger, input.now, input.snapshot.id]); return null; },
      updatePoolAvailability: () => { calls.push(['pool']); },
      clearLastFailure: () => { calls.push(['clear']); },
    },
  };
}

function readingFor(recommendation, overrides = {}) {
  return { recommendation, dayQuestionPending: false, awaitsWeatherRefresh: () => false, ...overrides };
}

test('a changed approved signal refreshes with its trigger', async () => {
  const { calls, recommendation } = recordingRecommendation(persistedFor({ dressStyle: 'casual' }));
  await createApprovedTriggerEvaluation().evaluate(() => inputFor(), readingFor(recommendation), false);
  assert.deepEqual(calls, [['refresh', 'dress-style-changed', '2026-08-01T12:00:00.000Z', 'weather-one']]);
});

test('no persisted recommendation asks for the first one', async () => {
  const { calls, recommendation } = recordingRecommendation(null);
  await createApprovedTriggerEvaluation().evaluate(() => inputFor(), readingFor(recommendation), false);
  assert.deepEqual(calls, [['refresh', 'first-recommendation', '2026-08-01T12:00:00.000Z', 'weather-one']]);
});

test('an unanswered day question holds every trigger', async () => {
  const { calls, recommendation } = recordingRecommendation(null);
  await createApprovedTriggerEvaluation().evaluate(() => inputFor(),
    readingFor(recommendation, { dayQuestionPending: true }), false);
  assert.deepEqual(calls, [['clear']]);
});

test('a first outfit waiting for a weather refresh in flight starts nothing yet', async () => {
  const { calls, recommendation } = recordingRecommendation(null);
  const waitedFor = [];
  await createApprovedTriggerEvaluation().evaluate(() => inputFor(), readingFor(recommendation, {
    awaitsWeatherRefresh: (input, trigger) => { waitedFor.push([input.localDayKey, trigger]); return true; },
  }), false);
  assert.deepEqual(waitedFor, [[dayKey, 'first-recommendation']]);
  assert.deepEqual(calls, [['clear']]);
});

test('no trigger updates the pool availability and clears the last failure', async () => {
  const { calls, recommendation } = recordingRecommendation(persistedFor());
  await createApprovedTriggerEvaluation().evaluate(() => inputFor(), readingFor(recommendation), false);
  assert.deepEqual(calls, [['pool'], ['clear']]);
});

test('a recommendation that is not ready yet starts nothing', async () => {
  const calls = [];
  const recommendation = {
    getSnapshot: () => ({ status: 'loading' }),
    refresh: async () => { calls.push('refresh'); },
    updatePoolAvailability: () => { calls.push('pool'); },
    clearLastFailure: () => { calls.push('clear'); },
  };
  await createApprovedTriggerEvaluation().evaluate(() => inputFor(), readingFor(recommendation), false);
  assert.deepEqual(calls, ['clear']);
});

test('nothing to compose for evaluates nothing', async () => {
  const { calls, recommendation } = recordingRecommendation(persistedFor());
  await createApprovedTriggerEvaluation().evaluate(() => null, readingFor(recommendation), true);
  assert.deepEqual(calls, []);
});

test('ended coverage reselects once on a foreground evaluation, never on a background one', async () => {
  const ended = persistedFor({ coverageEnd: '2026-08-01T11:00:00.000Z' });
  const { calls, recommendation } = recordingRecommendation(ended);
  const evaluation = createApprovedTriggerEvaluation();
  const reading = readingFor(recommendation);

  await evaluation.evaluate(() => inputFor(), reading, false);
  assert.deepEqual(calls.splice(0), [['pool'], ['clear']]);

  await evaluation.evaluate(() => inputFor(), reading, true);
  assert.deepEqual(calls.splice(0), [['refresh', 'explicit', '2026-08-01T12:00:00.000Z', 'weather-one']]);

  await evaluation.evaluate(() => inputFor(), reading, true);
  assert.deepEqual(calls.splice(0), [['pool'], ['clear']]);
});

test('coverage still running reselects nothing on a foreground evaluation', async () => {
  const running = persistedFor({ coverageEnd: '2026-08-01T13:00:00.000Z' });
  const { calls, recommendation } = recordingRecommendation(running);
  await createApprovedTriggerEvaluation().evaluate(() => inputFor(), readingFor(recommendation), true);
  assert.deepEqual(calls, [['pool'], ['clear']]);
});

test('a foreground ask that joins a generation in flight evaluates once more after it', async () => {
  let persisted = persistedFor({ dressStyle: 'casual' });
  const calls = [];
  let finishRefresh;
  const recommendation = {
    getSnapshot: () => ({ status: 'ready', snapshot: persisted }),
    refresh: (trigger, input) => {
      calls.push(['refresh', trigger, input.now]);
      return new Promise((resolve) => { finishRefresh = () => { persisted = persistedFor(); resolve(null); }; });
    },
    updatePoolAvailability: (input) => { calls.push(['pool', input.now]); },
    clearLastFailure: () => { calls.push(['clear']); },
  };
  const evaluation = createApprovedTriggerEvaluation();
  const reading = readingFor(recommendation);
  const background = evaluation.followRender(inputFor(), reading);
  await new Promise((resolve) => setImmediate(resolve));
  const reads = [inputFor(), inputFor({ now: '2026-08-01T12:05:00.000Z' })];
  const foreground = evaluation.evaluate(() => reads.shift(), reading, true);
  finishRefresh();
  await background;
  await foreground;
  assert.deepEqual(calls, [
    ['refresh', 'dress-style-changed', '2026-08-01T12:00:00.000Z'],
    ['pool', '2026-08-01T12:05:00.000Z'],
  ]);
});

test('evaluation waits for a confirmed re-ask and then reads the persisted result', async () => {
  let persisted = persistedFor({ dressStyle: 'casual' });
  const calls = [];
  const recommendation = {
    getSnapshot: () => ({ status: 'ready', snapshot: persisted }),
    refresh: async (trigger) => { calls.push(trigger); },
    updatePoolAvailability: () => { calls.push('pool'); },
    clearLastFailure: () => { calls.push('clear'); },
  };
  const evaluation = createApprovedTriggerEvaluation();
  let finishReask;
  const reask = evaluation.trackReask(new Promise((resolve) => { finishReask = resolve; }));
  const evaluated = evaluation.evaluate(() => inputFor(), readingFor(recommendation), false);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, []);
  persisted = persistedFor();
  finishReask('done');
  assert.equal(await reask, 'done');
  await evaluated;
  assert.deepEqual(calls, ['pool', 'clear']);
});

test('the first outfit waits for weather only while a refresh is in flight and the day has no outfit', () => {
  const refreshing = { status: 'ready', isRefreshing: true };
  const settled = { status: 'ready', isRefreshing: false };
  const ready = (localDayKey) => ({ status: 'ready', snapshot: { localDayKey } });
  assert.equal(firstOutfitAwaitsWeatherRefresh(refreshing, ready('2026-07-31'), dayKey), true);
  assert.equal(firstOutfitAwaitsWeatherRefresh(refreshing, { status: 'ready', snapshot: null }, dayKey), true);
  assert.equal(firstOutfitAwaitsWeatherRefresh(refreshing, { status: 'loading' }, dayKey), true);
  assert.equal(firstOutfitAwaitsWeatherRefresh(refreshing, ready(dayKey), dayKey), false);
  assert.equal(firstOutfitAwaitsWeatherRefresh(settled, ready('2026-07-31'), dayKey), false);
  assert.equal(firstOutfitAwaitsWeatherRefresh({ status: 'loading' }, ready('2026-07-31'), dayKey), false);
});

test('a place change waits for weather only while the new place is refreshing', () => {
  const placeB = 'manual:sample.ankara';
  const refreshing = (locationKey) => ({ status: 'ready', isRefreshing: true, activeLocation: { locationKey } });
  const today = { status: 'ready', snapshot: { localDayKey: dayKey } };
  const placeInput = { localDayKey: dayKey, snapshot: { locationKey: placeB } };
  assert.equal(approvedTriggerAwaitsWeatherRefresh(refreshing(placeB), today, placeInput,
    'active-location-changed'), true);
  assert.equal(approvedTriggerAwaitsWeatherRefresh(refreshing('manual:sample.izmir'), today, placeInput,
    'active-location-changed'), false);
  assert.equal(approvedTriggerAwaitsWeatherRefresh({ ...refreshing(placeB), isRefreshing: false }, today,
    placeInput, 'active-location-changed'), false);
  assert.equal(approvedTriggerAwaitsWeatherRefresh(refreshing(placeB), today, placeInput,
    'dress-style-changed'), false);
  assert.equal(approvedTriggerAwaitsWeatherRefresh(refreshing(placeB), { status: 'ready', snapshot: null },
    placeInput, 'first-recommendation'), true);
});

test('a place change generates from the weather its refresh brings', async () => {
  const placeB = 'manual:sample.ankara';
  const { calls, recommendation } = recordingRecommendation(persistedFor());
  const evaluation = createApprovedTriggerEvaluation();
  let weather = { status: 'ready', isRefreshing: true, activeLocation: { locationKey: placeB } };
  const reading = readingFor(recommendation, {
    awaitsWeatherRefresh: (input, trigger) => approvedTriggerAwaitsWeatherRefresh(
      weather, recommendation.getSnapshot(), input, trigger),
  });
  const placeInput = (id) => inputFor({ snapshot: { id, locationKey: placeB } });

  await evaluation.followRender(placeInput('b-stale'), reading);
  assert.deepEqual(calls, []);

  weather = { ...weather, isRefreshing: false };
  await evaluation.followRender(placeInput('b-fresh'), reading);
  assert.deepEqual(calls, [['refresh', 'active-location-changed', '2026-08-01T12:00:00.000Z', 'b-fresh']]);
});

test('a place change whose weather refresh fails generates from the stored weather', async () => {
  const placeB = 'manual:sample.ankara';
  const { calls, recommendation } = recordingRecommendation(persistedFor());
  const evaluation = createApprovedTriggerEvaluation();
  let weather = { status: 'ready', isRefreshing: true, activeLocation: { locationKey: placeB } };
  const reading = readingFor(recommendation, {
    awaitsWeatherRefresh: (input, trigger) => approvedTriggerAwaitsWeatherRefresh(
      weather, recommendation.getSnapshot(), input, trigger),
  });
  const stale = inputFor({ snapshot: { id: 'b-stale', locationKey: placeB } });

  await evaluation.followRender(stale, reading);
  assert.deepEqual(calls, []);

  weather = { ...weather, isRefreshing: false, refreshFailure: 'unavailable' };
  await evaluation.followRender({ ...stale }, reading);
  assert.deepEqual(calls, [['refresh', 'active-location-changed', '2026-08-01T12:00:00.000Z', 'b-stale']]);
});
