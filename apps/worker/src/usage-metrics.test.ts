import assert from 'node:assert/strict';
import test from 'node:test';

import { aiAttemptFailureReasons } from './ai/ai-provider.ts';
import {
  aiAttemptOutcome,
  createUsageMetrics,
  noUsageMetrics,
  usageOutcomes,
  weatherAttemptOutcome,
  type UsageEvent,
} from './usage-metrics.ts';
import { weatherProviderErrorKinds } from './weather/weather-provider-error.ts';

type Point = { indexes?: readonly string[]; blobs?: readonly string[]; doubles?: readonly number[] };

function recordingDataset() {
  const points: Point[] = [];
  return { points, dataset: { writeDataPoint(point: Point) { points.push(point); } } };
}

test('writes one data point per event holding only the closed fields', () => {
  const { points, dataset } = recordingDataset();
  const usage = createUsageMetrics(dataset);
  usage({ event: 'ai_cache', route: 'v2', outcome: 'hit' });
  usage({ event: 'ai_attempt', provider: 'haiku', outcome: 'quota' });
  usage({ event: 'weather_attempt', provider: 'weatherkit', outcome: 'ok' });
  usage({ event: 'daily_budget', counter: 'workers-ai', outcome: 'exhausted' });
  assert.deepEqual(points, [
    { indexes: ['ai_cache'], blobs: ['v2', 'hit'], doubles: [1] },
    { indexes: ['ai_attempt'], blobs: ['haiku', 'quota'], doubles: [1] },
    { indexes: ['weather_attempt'], blobs: ['weatherkit', 'ok'], doubles: [1] },
    { indexes: ['daily_budget'], blobs: ['workers-ai', 'exhausted'], doubles: [1] },
  ]);
});

test('a value outside the closed lists writes nothing, so free text never reaches the dataset', () => {
  const { points, dataset } = recordingDataset();
  const usage = createUsageMetrics(dataset);
  const outside = [
    { event: 'ai_attempt', provider: 'a-model-or-a-prompt', outcome: 'ok' },
    { event: 'ai_attempt', provider: 'haiku', outcome: 'some error text' },
    { event: 'ai_attempt', provider: undefined, outcome: 'ok' },
    { event: 'weather_attempt', provider: '41.01,28.97', outcome: 'ok' },
    { event: 'ai_cache', route: '/v2/ai/recommend?x=1', outcome: 'hit' },
    { event: 'daily_budget', counter: 'someone', outcome: 'exhausted' },
    { event: 'anything_else' },
  ] as unknown as UsageEvent[];
  for (const event of outside) usage(event);
  assert.deepEqual(points, []);
});

test('without a dataset binding recording is a no-op', () => {
  const usage = createUsageMetrics(undefined);
  assert.equal(usage, noUsageMetrics);
  assert.doesNotThrow(() => usage({ event: 'ai_cache', route: 'v1', outcome: 'miss' }));
});

test('a dataset that throws never throws out of the recorder', () => {
  const usage = createUsageMetrics({ writeDataPoint() { throw new Error('analytics unavailable'); } });
  assert.doesNotThrow(() => usage({ event: 'ai_attempt', provider: 'workers-ai', outcome: 'ok' }));
});

test('every failure reason and error kind maps into the closed outcome list', () => {
  for (const reason of aiAttemptFailureReasons) {
    assert.ok((usageOutcomes as readonly string[]).includes(aiAttemptOutcome(reason)), reason);
  }
  for (const kind of weatherProviderErrorKinds) {
    assert.ok((usageOutcomes as readonly string[]).includes(weatherAttemptOutcome(kind)), kind);
  }
  assert.equal(aiAttemptOutcome('provider_error'), 'upstream');
  assert.equal(aiAttemptOutcome('quota_exceeded'), 'quota');
  assert.equal(aiAttemptOutcome('archetype_precondition'), 'invalid');
  assert.equal(weatherAttemptOutcome('auth'), 'auth');
});
