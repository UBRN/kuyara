// The port's view of one refresh: exactly one `recommendation.generated` per completed
// attempt, with only the declared attribute keys, and an error report only when the person
// was left without a new recommendation.
import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendationGeneratedAttributeKeys } from '../analytics/domain/performance-telemetry-events.ts';
import { RecommendationApplicationController } from './application/recommendation-application-controller.ts';
import { recommendOutfits } from './application/recommend-outfits.ts';
import { WorkerAiClientError } from './data/worker-ai-client.ts';
import { todayWeatherSnapshot } from '../today/__tests__/fixtures.ts';

const profileId = 'profile-one';

function recordingTelemetry() {
  const events = [];
  const errors = [];
  return {
    events,
    errors,
    telemetry: {
      logEvent: (name, attributes) => events.push({ name, attributes }),
      reportError: (error) => errors.push(error),
      setDispatching: () => undefined,
    },
  };
}

function fakeRepository() {
  return {
    getSnapshot: async () => null,
    saveSnapshot: async (localProfileId, input) => ({
      id: 'snapshot-one',
      localProfileId,
      weatherSnapshotId: input.weatherSnapshotId,
      locationKey: input.locationKey,
      clothingPreference: input.context.clothingPreference,
      dressStyle: input.context.dressStyle,
      dayVariant: input.context.dayVariant,
      localDayKey: input.context.localDayKey ?? null,
      generationMode: input.recommendation.generationMode,
      recommendation: input.recommendation,
      createdAt: '2026-08-13T06:05:00.000Z',
      updatedAt: '2026-08-13T06:05:00.000Z',
    }),
  };
}

const input = {
  snapshot: todayWeatherSnapshot,
  now: '2026-08-13T06:05:00.000Z',
  clothingPreference: 'womens',
  dressStyle: 'smart',
  dayVariant: 0,
  localDayKey: '2026-08-13',
};

// The routed client answers with a validated recommendation, so the controller only has to
// save it. The outfits are the ones the deterministic composition produces for this input,
// relabelled with the tier that would have picked them.
function aiClientReturning(generationMode) {
  const composed = recommendOutfits({ ...input, excludedOptionIds: [] });
  if (composed.status !== 'recommended') throw new Error('the fixture composes no outfits');
  return {
    recommendRouted: async () => ({ ...composed, generationMode }),
  };
}

async function refreshOnce(dependencies) {
  const { events, errors, telemetry } = recordingTelemetry();
  const controller = new RecommendationApplicationController(profileId, {
    loadRepository: async () => fakeRepository(),
    telemetry,
    getOnDeviceAvailability: () => ({ status: 'unavailable', reason: 'device_not_eligible' }),
    ...dependencies,
  });
  await controller.initialize();
  await controller.refresh('first-recommendation', input);
  return { events, errors };
}

test('a worker-tier success reports one event with only the declared keys', async () => {
  const { events, errors } = await refreshOnce({ client: aiClientReturning('ai-assisted') });

  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.name, 'recommendation.generated');
  for (const key of Object.keys(event.attributes)) {
    assert.ok(
      recommendationGeneratedAttributeKeys.includes(key),
      `undeclared attribute key: ${key}`,
    );
  }
  assert.equal(event.attributes.generation_mode, 'ai_assisted');
  assert.equal(event.attributes.tier_attempted, 'worker');
  assert.equal(event.attributes.outcome, 'success');
  assert.equal(event.attributes.option_count, 3);
  assert.equal(event.attributes.on_device_availability, 'device_not_eligible');
  assert.ok(Number.isInteger(event.attributes.duration_ms));
  assert.ok(event.attributes.duration_ms >= 0);
  assert.equal('failure_kind' in event.attributes, false);
  assert.deepEqual(errors, []);
});

test('an AI failure the deterministic composition covers is an event, not an error report', async () => {
  const { events, errors } = await refreshOnce({
    client: {
      recommendRouted: async () => {
        throw new WorkerAiClientError('network');
      },
    },
  });

  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.attributes.generation_mode, 'deterministic_fallback');
  assert.equal(event.attributes.tier_attempted, 'deterministic');
  assert.equal(event.attributes.outcome, 'fallback');
  assert.equal(event.attributes.failure_kind, 'offline');
  assert.equal(event.attributes.option_count, 3);
  assert.deepEqual(errors, []);
});

test('an attempt that leaves no new recommendation reports a sanitized error', async () => {
  const { events, errors } = await refreshOnce({
    client: {
      recommendRouted: async () => {
        throw new WorkerAiClientError('service');
      },
    },
    loadRepository: async () => ({
      getSnapshot: async () => null,
      saveSnapshot: async () => {
        throw new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed on value "Ayse"');
      },
    }),
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].attributes.outcome, 'fallback');
  assert.equal(events[0].attributes.option_count, 0);
  assert.equal(events[0].attributes.failure_kind, 'unavailable');
  assert.equal('generation_mode' in events[0].attributes, false);

  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'recommendation.refresh_failed');
  assert.equal(errors[0].message, 'recommendation.refresh_failed failure_kind=unavailable');
  // The thrown SQLite message never reaches the report.
  assert.equal(errors[0].message.includes('Ayse'), false);
});
