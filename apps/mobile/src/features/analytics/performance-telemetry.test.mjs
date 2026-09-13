import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TelemetryError,
  telemetryDispatchingEnabled,
} from './domain/performance-telemetry.ts';
import {
  recommendationGeneratedAttributeKeys,
  recommendationGeneratedAttributes,
  telemetryFailureKind,
  weatherRefreshedAttributeKeys,
  weatherRefreshedAttributes,
} from './domain/performance-telemetry-events.ts';

test('dispatch follows the recorded consent answer, and only "granted" dispatches', () => {
  assert.equal(telemetryDispatchingEnabled('granted'), true);
  assert.equal(telemetryDispatchingEnabled('withdrawn'), false);
  assert.equal(telemetryDispatchingEnabled('undecided'), false);
});

test('a reported error carries only its code and coarse attributes', () => {
  const error = new TelemetryError('profile.bootstrap_failed', {
    stage: 'migration',
    error_name: 'SQLiteError',
  });

  assert.ok(error instanceof Error);
  assert.equal(error.name, 'KuyaraTelemetryError');
  assert.equal(error.code, 'profile.bootstrap_failed');
  assert.equal(error.message, 'profile.bootstrap_failed stage=migration error_name=SQLiteError');
  assert.equal(new TelemetryError('recommendation.refresh_failed').message, 'recommendation.refresh_failed');
});

// The guard the brief asks for: a new attribute key anywhere in the builder fails this test,
// so a property cannot reach Observe without being added to the declared list and reviewed
// against the taxonomy's exclusion checklist.
test('recommendation.generated produces only declared keys, in every branch', () => {
  const declared = new Set(recommendationGeneratedAttributeKeys);
  const branches = [
    { generationMode: 'on-device-ai', onDeviceAvailability: { status: 'available' }, durationMs: 1200.6, optionCount: 3, failure: null },
    { generationMode: 'ai-assisted', onDeviceAvailability: { status: 'unavailable', reason: 'model_not_ready' }, durationMs: 4000, optionCount: 3, failure: null },
    { generationMode: 'deterministic-fallback', onDeviceAvailability: null, durationMs: 20000, optionCount: 3, failure: 'offline' },
    { generationMode: null, onDeviceAvailability: { status: 'unavailable' }, durationMs: -5, optionCount: 0, failure: 'rate-limited' },
  ];

  for (const branch of branches) {
    for (const key of Object.keys(recommendationGeneratedAttributes(branch))) {
      assert.ok(declared.has(key), `undeclared attribute key: ${key}`);
    }
  }

  const produced = new Set(
    branches.flatMap((branch) => Object.keys(recommendationGeneratedAttributes(branch))),
  );
  assert.deepEqual([...produced].sort(), [...declared].sort());
});

test('recommendation.generated reports the deepest tier reached and the coarse availability', () => {
  assert.deepEqual(
    recommendationGeneratedAttributes({
      generationMode: 'on-device-ai',
      onDeviceAvailability: { status: 'available' },
      durationMs: 1200.6,
      optionCount: 3,
      failure: null,
    }),
    {
      generation_mode: 'on_device_ai',
      tier_attempted: 'on_device',
      on_device_availability: 'available',
      duration_ms: 1201,
      outcome: 'success',
      option_count: 3,
    },
  );

  assert.deepEqual(
    recommendationGeneratedAttributes({
      generationMode: 'deterministic-fallback',
      onDeviceAvailability: { status: 'unavailable', reason: 'apple_intelligence_not_enabled' },
      durationMs: 21000,
      optionCount: 3,
      failure: 'unavailable',
    }),
    {
      generation_mode: 'deterministic_fallback',
      tier_attempted: 'deterministic',
      on_device_availability: 'apple_intelligence_not_enabled',
      duration_ms: 21000,
      outcome: 'fallback',
      option_count: 3,
      failure_kind: 'unavailable',
    },
  );

  assert.deepEqual(
    recommendationGeneratedAttributes({
      generationMode: null,
      onDeviceAvailability: null,
      durationMs: -1,
      optionCount: 0,
      failure: 'rate-limited',
    }),
    {
      tier_attempted: 'deterministic',
      on_device_availability: 'not_attempted',
      duration_ms: 0,
      outcome: 'fallback',
      option_count: 0,
      failure_kind: 'rate_limited',
    },
  );

  assert.equal(
    recommendationGeneratedAttributes({
      generationMode: 'ai-assisted',
      onDeviceAvailability: { status: 'unavailable' },
      durationMs: 10,
      optionCount: 3,
      failure: null,
    }).on_device_availability,
    'unknown',
  );
});

test('the failure kind is the shared category, normalized to one vocabulary', () => {
  assert.equal(telemetryFailureKind('rate-limited'), 'rate_limited');
  assert.equal(telemetryFailureKind('offline'), 'offline');
  assert.equal(telemetryFailureKind('unavailable'), 'unavailable');
  assert.equal(telemetryFailureKind('unknown'), 'unknown');
});

test('weather.refreshed carries the attribution source only when one answered', () => {
  const declared = new Set(weatherRefreshedAttributeKeys);
  const success = weatherRefreshedAttributes({
    durationMs: 820.4,
    outcome: 'success',
    source: 'weatherkit',
  });
  assert.deepEqual(success, { duration_ms: 820, outcome: 'success', source: 'weatherkit' });

  const failure = weatherRefreshedAttributes({ durationMs: 9000, outcome: 'failure', source: null });
  assert.deepEqual(failure, { duration_ms: 9000, outcome: 'failure' });

  for (const key of [...Object.keys(success), ...Object.keys(failure)]) {
    assert.ok(declared.has(key), `undeclared attribute key: ${key}`);
  }
});
