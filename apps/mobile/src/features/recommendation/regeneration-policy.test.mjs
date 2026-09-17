// Today's "show another outfit" action end to end, minus React: the policy that decides
// whether a tap may reach the AI chain, the controller path each answer takes, and what the
// analytics event says about it. The composition boundary is mirrored here the way the
// provider writes it, because the controller deliberately knows nothing about the allowance.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RecommendationApplicationController, recommendationRefreshTrigger } from './application/recommendation-application-controller.ts';
import { recommendOutfits } from './application/recommend-outfits.ts';
import { WorkerAiClientError } from './data/worker-ai-client.ts';
import {
  aiRequestFromContext,
  createRecommendationContext,
} from './data/worker-ai-recommendation-mapper.ts';
import { regenerationMode, regenerationPolicy } from './domain/regeneration-policy.ts';
import { todayWeatherSnapshot } from '../today/__tests__/fixtures.ts';

const profileId = 'profile-one';
const today = '2026-08-13';
const tomorrow = '2026-08-14';

// The in-memory twin of `ExpoFileAiRegenerationBudget`: one day's count, and a key that is
// not today's reads as zero, so a new local day needs no sweep. `record` mutates before its
// first await, which is what makes the provider's fire-and-forget `void record(...)` land
// before the next read.
function inMemoryBudget() {
  let entry = { dayKey: '', count: 0 };
  return {
    usedToday: async (dayKey) => (entry.dayKey === dayKey ? entry.count : 0),
    record: async (dayKey) => {
      entry = entry.dayKey === dayKey
        ? { dayKey, count: entry.count + 1 }
        : { dayKey, count: 1 };
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

function dayAt(temperatureCelsius, condition, precipitationProbability) {
  const measurements = {
    temperatureCelsius,
    apparentTemperatureCelsius: temperatureCelsius,
    condition,
    precipitationProbability,
    windSpeedMetersPerSecond: 1,
    humidity: 0.5,
    uvIndex: 3,
  };
  return {
    ...todayWeatherSnapshot,
    current: { observedAt: '2026-08-13T06:00:00.000Z', ...measurements },
    minimumTemperatureCelsius: temperatureCelsius - 1,
    maximumTemperatureCelsius: temperatureCelsius + 1,
    hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...measurements }],
  };
}

function inputFor(snapshot = todayWeatherSnapshot, localDayKey = today) {
  return {
    snapshot,
    now: '2026-08-13T06:05:00.000Z',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    dayVariant: 0,
    dayKind: 'weekday',
    localDayKey,
  };
}

// The routed client already ran the validation gate, so the controller takes what it answers.
// These are the three the deterministic composition produces for the same input, relabelled
// with the tier that would have picked them.
function aiClient(input) {
  const composed = recommendOutfits({ ...input, excludedOptionIds: [] });
  if (composed.status !== 'recommended') throw new Error('the fixture composes no outfits');
  const requests = [];
  return {
    requests,
    client: {
      recommendRouted: async (request) => {
        requests.push(request);
        return { ...composed, generationMode: 'ai-assisted' };
      },
    },
  };
}

function createController({ client, budget, captures = [] }) {
  return new RecommendationApplicationController(profileId, {
    loadRepository: async () => fakeRepository(),
    client,
    captureAnalyticsEvent: (name, properties) => captures.push({ name, properties }),
    holdPhase: async () => undefined,
    onAiAttempt: (trigger, dayKey) => {
      if (trigger === 'regenerate') void budget.record(dayKey);
    },
  });
}

// Exactly what `RecommendationApplicationProvider.regenerate` does: read the allowance, ask
// the policy, and hand the answer to the controller as `allowAi`.
async function regenerate(controller, budget, input) {
  const used = await budget.usedToday(input.localDayKey);
  return controller.refresh('regenerate', input, {
    allowAi: regenerationMode(used) === 'ai',
  });
}

function optionIds(snapshot) {
  return snapshot.recommendation.outfits.map(({ optionId }) => optionId);
}

test('the policy opens the AI path until the daily allowance is spent, then the pool path', () => {
  assert.equal(regenerationPolicy.dailyAiRegenerations, 5);
  assert.equal(regenerationMode(0), 'ai');
  assert.equal(regenerationMode(4), 'ai');
  assert.equal(regenerationMode(5), 'pool');
  // The number is a policy argument, not a constant baked into the rule.
  assert.equal(regenerationMode(1, { dailyAiRegenerations: 1 }), 'pool');
});

// Gate 1, and gate 3's "the pool three differ from the three on screen".
test('the sixth regeneration of a local day builds no request and composes from the pool', async () => {
  const input = inputFor();
  const budget = inMemoryBudget();
  const { client, requests } = aiClient(input);
  const controller = createController({ client, budget });
  await controller.initialize();

  const snapshots = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    snapshots.push(await regenerate(controller, budget, input));
  }

  // Five taps reached the chain; the sixth never built a request, so nothing was sent.
  assert.equal(requests.length, 5);
  for (const snapshot of snapshots.slice(0, 5)) {
    assert.equal(snapshot.generationMode, 'ai-assisted');
  }
  const pooled = snapshots[5];
  assert.equal(pooled.generationMode, 'deterministic-fallback');
  assert.equal(pooled.recommendation.status, 'recommended');
  assert.equal(pooled.recommendation.outfits.length, 3);
  assert.equal(new Set(optionIds(pooled)).size, 3);
  assert.equal(
    new Set(pooled.recommendation.outfits.map(({ archetypeId }) => archetypeId)).size,
    3,
  );
  // Gate 3: the pool three are not the three that were on screen.
  const previous = new Set(optionIds(snapshots[4]));
  assert.ok(optionIds(pooled).every((id) => !previous.has(id)));
  // Gate 5's second half: the tap that never reached the chain spent nothing.
  assert.equal(await budget.usedToday(today), 5);
});

// Gate 2.
test('a new local day reads the allowance as zero and the next tap takes the AI path again', async () => {
  const input = inputFor();
  const budget = inMemoryBudget();
  const { client, requests } = aiClient(input);
  const controller = createController({ client, budget });
  await controller.initialize();

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await regenerate(controller, budget, input);
  }
  assert.equal(requests.length, 5);

  const nextDay = await regenerate(controller, budget, inputFor(todayWeatherSnapshot, tomorrow));
  assert.equal(requests.length, 6);
  assert.equal(nextDay.generationMode, 'ai-assisted');
  assert.equal(await budget.usedToday(tomorrow), 1);
  // One day is stored at a time: the new day's first record replaces yesterday's entry, so
  // nothing accumulates and no sweep exists.
  assert.equal(await budget.usedToday(today), 0);
});

// Gate 3, on its own: two pool taps in a row each offer something else.
test('consecutive pool regenerations each offer a valid three that is not the last', async () => {
  const input = inputFor();
  const budget = inMemoryBudget();
  const { client, requests } = aiClient(input);
  const controller = createController({ client, budget });
  await controller.initialize();

  const first = await controller.refresh('regenerate', input, { allowAi: false });
  const second = await controller.refresh('regenerate', input, { allowAi: false });

  assert.equal(requests.length, 0);
  for (const snapshot of [first, second]) {
    assert.equal(snapshot.generationMode, 'deterministic-fallback');
    assert.equal(snapshot.recommendation.status, 'recommended');
    assert.equal(snapshot.recommendation.outfits.length, 3);
  }
  const shown = new Set(optionIds(first));
  assert.ok(optionIds(second).every((id) => !shown.has(id)));
});

// Gate 4. This is the recorded behaviour of `docs/product-decisions.md`'s cache identity
// rule, not a defect: the exclusion is dropped whole rather than showing fewer than three.
test('a warm day composing four options drops the exclusion and repeats the same three', async () => {
  const warm = dayAt(28, 'clear', 0);
  const context = createRecommendationContext(inputFor(warm), today);
  assert.equal(context.options.length, 4);

  const input = inputFor(warm);
  const budget = inMemoryBudget();
  const { client } = aiClient(input);
  const controller = createController({ client, budget });
  await controller.initialize();

  const first = await controller.refresh('regenerate', input, { allowAi: false });
  const second = await controller.refresh('regenerate', input, { allowAi: false });

  assert.deepEqual(optionIds(second), optionIds(first));
});

// Gate 5's first half.
test('an AI attempt that fails into the deterministic three still spends one regeneration', async () => {
  const input = inputFor();
  const budget = inMemoryBudget();
  const controller = createController({
    budget,
    client: {
      recommendRouted: async () => {
        throw new WorkerAiClientError('service');
      },
    },
  });
  await controller.initialize();

  const snapshot = await regenerate(controller, budget, input);

  assert.equal(snapshot.generationMode, 'deterministic-fallback');
  assert.equal(await budget.usedToday(today), 1);
});

// Gate 5's second half, at the boundary that decides it: a pool under three yields no
// request at all, and the controller records an attempt only inside the request branch.
test('a pool under three builds no request, so no regeneration is spent', async () => {
  const context = createRecommendationContext(inputFor(), today);
  const narrow = { ...context, options: context.options.slice(0, 2) };

  assert.equal(aiRequestFromContext(narrow), null);

  const input = inputFor();
  const budget = inMemoryBudget();
  const { client, requests } = aiClient(input);
  const controller = createController({ client, budget });
  await controller.initialize();

  await controller.refresh('regenerate', input, { allowAi: false });

  assert.equal(requests.length, 0);
  assert.equal(await budget.usedToday(today), 0);
});

// Gate 6: the six automatic triggers are still the only ones the signal comparison produces.
// "show another outfit" is a user action and can never be inferred from a signal change.
test('the signal comparison never produces the regenerate trigger', () => {
  const signals = {
    weatherSnapshotId: 'snapshot-one',
    locationKey: 'manual:sample.istanbul',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    catalogVersion: 1,
    localDayKey: today,
  };
  const changes = [
    { weatherSnapshotId: 'snapshot-two' },
    { locationKey: 'manual:sample.ankara' },
    { clothingPreference: 'mens' },
    { dressStyle: 'casual' },
    { catalogVersion: 2 },
    { localDayKey: tomorrow },
    {},
  ];
  for (const change of changes) {
    const trigger = recommendationRefreshTrigger(signals, { ...signals, ...change }, null);
    assert.notEqual(trigger, 'regenerate');
  }
  assert.equal(recommendationRefreshTrigger(null, signals, null), 'first-recommendation');
});

// Gate 8.
test('two taps in the same tick coalesce into one generation', async () => {
  const input = inputFor();
  const budget = inMemoryBudget();
  const { client, requests } = aiClient(input);
  const controller = createController({ client, budget });
  await controller.initialize();

  const [first, second] = await Promise.all([
    regenerate(controller, budget, input),
    regenerate(controller, budget, input),
  ]);

  assert.equal(requests.length, 1);
  assert.equal(first, second);
  assert.equal(await budget.usedToday(today), 1);
});

// ADR 0023 and taxonomy 5.5.
test('regeneration_source qualifies a regenerate success and no other event', async () => {
  const input = inputFor();
  const budget = inMemoryBudget();
  const captures = [];
  const { client } = aiClient(input);
  const controller = createController({ client, budget, captures });
  await controller.initialize();

  await controller.refresh('explicit', input);
  await regenerate(controller, budget, input);
  await controller.refresh('regenerate', input, { allowAi: false });

  const regenerated = captures.filter(({ name }) => name === 'recommendation_regenerated');
  assert.equal(regenerated.length, 3);
  const [pull, viaAi, viaPool] = regenerated.map(({ properties }) => properties);

  assert.equal(pull.trigger_reason, 'explicit_request');
  assert.equal('regeneration_source' in pull, false);

  assert.equal(viaAi.trigger_reason, 'regenerate');
  assert.equal(viaAi.result, 'success');
  assert.equal(viaAi.regeneration_source, 'ai');

  assert.equal(viaPool.trigger_reason, 'regenerate');
  assert.equal(viaPool.regeneration_source, 'pool');

  // No provider, model, quota or remaining count reaches the payload.
  for (const properties of [viaAi, viaPool]) {
    assert.deepEqual(
      Object.keys(properties).sort(),
      ['generation_mode', 'regeneration_source', 'result', 'schema_version', 'trigger_reason'],
    );
  }
});
