import assert from 'node:assert/strict';
import test from 'node:test';

import { archetypeDayFromRequirements } from '@kuyara/contracts';

import { RoutedAiClient } from './routed-ai-client.ts';
import { WorkerAiRecommendationMappingError } from '../application/recommendation-mapping-error.ts';
import { WorkerAiClientError } from '../domain/worker-ai-client-error.ts';
import { aiRequestFor } from '../../../../test/recommendation-grid.mjs';

const observedAt = '2026-08-01T18:00:00.000Z';

function input() {
  return {
    snapshot: {
      id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
      localProfileId: 'profile-one',
      locationKey: 'manual:sample.istanbul',
      timeZone: 'UTC',
      fetchedAt: observedAt,
      origin: { kind: 'sample', sourceId: 'routed-test' },
      current: {
        observedAt,
        temperatureCelsius: 16,
        apparentTemperatureCelsius: 16,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      },
      minimumTemperatureCelsius: 16,
      maximumTemperatureCelsius: 17,
      hourly: [{
        forecastAt: '2026-08-01T19:00:00.000Z',
        temperatureCelsius: 16,
        apparentTemperatureCelsius: 16,
        condition: 'clear',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 0,
        humidity: 0.5,
        uvIndex: 0,
      }],
    },
    clothingPreference: 'womens',
    dayVariant: 0,
    localDayKey: '2026-08-01',
  };
}

const request = aiRequestFor(input());
const day = archetypeDayFromRequirements(request.requirements);

// Three options that differ in their body core, so the shared distinctness rule accepts
// them, each labelled with an archetype its own traits satisfy, so the mapper's archetype
// precondition accepts them too: an answer the shared gate lets through.
function archetypeFor(option, used) {
  const candidates = [
    day.wet && option.traits.outerWaterProtective && 'rain_ready',
    day.frozen && option.traits.tractionEnhanced && 'snow_day',
    day.cold && option.traits.outerThermalHigh && 'cold_shield',
    day.windy && option.traits.windResistant && 'wind_guard',
    option.traits.hasMidLayer && option.traits.hasOuterLayer && 'layered_warmth',
    option.traits.hasMidLayer && !option.traits.hasOuterLayer && 'in_between',
    !day.cold && !option.traits.hasOuterLayer && option.traits.breathabilityHigh
      && 'light_and_airy',
    // This request sends no dayKind, so office_ready holds for formal outfits only.
    option.formality === 'formal' && 'office_ready',
    option.formality !== 'casual' && 'smart_casual',
    option.garments.some(({ slot, garmentTypeId }) =>
      slot === 'footwear' && garmentTypeId === 'sneakers') && 'on_the_move',
    option.formality === 'casual' && 'weekend_relaxed',
    'everyday_easy',
  ].filter(Boolean);
  return candidates.find((candidate) => !used.has(candidate));
}

function distinctPicks() {
  const used = new Set();
  const chosen = [];
  for (const option of request.options) {
    const core = JSON.stringify(option.garments.filter(({ slot }) =>
      slot === 'primary_top' || slot === 'bottom' || slot === 'one_piece'));
    if (chosen.some((picked) => picked.core === core)) continue;
    const archetypeId = archetypeFor(option, used);
    if (!archetypeId) continue;
    used.add(archetypeId);
    chosen.push({ core, optionId: option.optionId, archetypeId });
    if (chosen.length === 3) break;
  }
  if (chosen.length !== 3) throw new Error('fixture needs three distinct body cores');
  return chosen.map(({ optionId, archetypeId }) => ({ optionId, archetypeId }));
}

const picks = distinctPicks();

function fakeWorker(answer = async () => ({ picks })) {
  return {
    calls: [],
    async recommend(_request, options) {
      this.calls.push(options);
      return answer();
    },
  };
}

function routed(worker) {
  return new RoutedAiClient({ worker });
}

// The Worker's own deadline: its 36 s walk plus 2 s of transport.
const workerWait = { timeoutMilliseconds: 38000, locale: 'en' };

test('the Worker answers first and the result is ai-assisted', async () => {
  const phases = [];
  const worker = fakeWorker();

  const result = await routed(worker)
    .recommendRouted(request, { onPhase: (phase) => phases.push(phase) });

  assert.equal(result.generationMode, 'ai-assisted');
  assert.deepEqual(result.outfits.map(({ optionId }) => optionId), picks.map(({ optionId }) => optionId));
  assert.deepEqual(worker.calls, [workerWait]);
  assert.deepEqual(phases, ['asking-stylist', 'answer-received']);
});

// Every Worker failure is the chain's failure: the routed client rejects with the Worker's
// own error, and the controller's catch composes the deterministic fallback next. Nothing
// runs between the two.
for (const [name, answer, expected, expectedPhases] of [
  ['an offline device', async () => {
    throw new WorkerAiClientError('network');
  }, WorkerAiClientError, ['asking-stylist']],
  ['a timed-out Worker', async () => {
    throw new WorkerAiClientError('network', { timedOut: true });
  }, WorkerAiClientError, ['asking-stylist']],
  ['an unavailable Worker', async () => {
    throw new WorkerAiClientError('service');
  }, WorkerAiClientError, ['asking-stylist']],
  ['a Worker answer the shared gate rejects', async () => ({
    picks: [picks[0], { ...picks[1], archetypeId: picks[0].archetypeId }, picks[2]],
  }), WorkerAiRecommendationMappingError, ['asking-stylist', 'answer-received']],
]) {
  test(`${name} rejects with the Worker's failure and asks no other tier`, async () => {
    const phases = [];
    const worker = fakeWorker(answer);

    await assert.rejects(
      () => routed(worker).recommendRouted(request, { onPhase: (phase) => phases.push(phase) }),
      (error) => error instanceof expected,
    );
    assert.equal(worker.calls.length, 1);
    assert.deepEqual(phases, expectedPhases);
  });
}

test('a re-ask reaches the Worker marked as one and an ordinary request does not', async () => {
  const worker = fakeWorker();

  await routed(worker).recommendRouted(request);
  await routed(worker).recommendRouted(request, { reask: true });

  assert.deepEqual(worker.calls, [workerWait, { ...workerWait, reask: true }]);
});

test('the request locale reaches the Worker', async () => {
  const worker = fakeWorker();

  const result = await routed(worker).recommendRouted(request, { locale: 'tr' });

  assert.deepEqual(worker.calls, [{ ...workerWait, locale: 'tr' }]);
  assert.equal(result.generationMode, 'ai-assisted');
});
