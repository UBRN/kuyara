import assert from 'node:assert/strict';
import test from 'node:test';
import { archetypeDayFromRequirements } from '@kuyara/contracts';

import {
  TomorrowPreviewController,
  forecastCoversWindow,
  previewAnswersQuestion,
  reusablePreviewRecommendation,
} from './tomorrow-preview.ts';
import { RecommendationApplicationController } from './recommendation-application-controller.ts';
import {
  aiRequestFromContext,
  createRecommendationContextWithPool,
  mapWorkerAiRecommendation,
} from '../data/worker-ai-recommendation-mapper.ts';
import { localDayKey, localDayKind, localDayVariant, nextMorningAfterEvening } from '../domain/local-day.ts';

// The suite runs with TZ=UTC, so the device clock and the place's zone read the same hours.
const profileId = 'profile-one';
const evening = '2026-10-01T19:00:00.000Z';
const morning = nextMorningAfterEvening(localDayKey(new Date(evening)), 'UTC', evening);
const tomorrowKey = localDayKey(morning);

function hour(at, temperatureCelsius, condition = 'clear') {
  return {
    temperatureCelsius,
    apparentTemperatureCelsius: temperatureCelsius,
    condition,
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 0,
    humidity: 0.5,
    uvIndex: 0,
    ...at,
  };
}

function weather({ id = 'weather-evening', observedAt = evening, hours = 36, temperature = 20,
  locationKey = 'manual:sample.istanbul' } = {}) {
  const start = Date.parse(observedAt);
  return {
    id,
    localProfileId: profileId,
    locationKey,
    timeZone: 'UTC',
    fetchedAt: observedAt,
    origin: { kind: 'sample', sourceId: 'preview-test' },
    current: hour({ observedAt }, temperature),
    minimumTemperatureCelsius: temperature,
    maximumTemperatureCelsius: temperature + 1,
    hourly: Array.from({ length: hours }, (_, index) =>
      hour({ forecastAt: new Date(start + (index + 1) * 3600000).toISOString() }, temperature)),
  };
}

function previewInput(overrides = {}) {
  return {
    snapshot: weather(),
    now: evening,
    departureAt: morning.toISOString(),
    clothingPreference: 'womens',
    dressStyle: 'smart',
    styleAesthetics: [],
    dayVariant: localDayVariant(morning),
    dayKind: localDayKind(morning),
    localDayKey: tomorrowKey,
    locale: 'en',
    excludedOptionIds: [],
    ...overrides,
  };
}

// The morning's own generation input: the same day, leaving now, on a later weather snapshot.
function morningInput(overrides = {}) {
  const observedAt = morning.toISOString();
  return {
    snapshot: weather({ id: 'weather-morning', observedAt }),
    now: observedAt,
    clothingPreference: 'womens',
    dressStyle: 'smart',
    styleAesthetics: [],
    dayVariant: localDayVariant(morning),
    dayKind: localDayKind(morning),
    localDayKey: tomorrowKey,
    locale: 'en',
    ...overrides,
  };
}

function picks(request) {
  const used = new Set();
  const day = archetypeDayFromRequirements(request.requirements);
  return {
    picks: request.options.slice(0, 3).map((option) => {
      const archetypeId = [
        option.traits.hasMidLayer && option.traits.hasOuterLayer && 'layered_warmth',
        option.traits.hasMidLayer && !option.traits.hasOuterLayer && 'in_between',
        !day.cold && !option.traits.hasOuterLayer && option.traits.breathabilityHigh && 'light_and_airy',
        option.formality !== 'casual' && 'smart_casual',
        option.formality === 'casual' && request.dayKind !== 'weekday' && 'weekend_relaxed',
        option.formality === 'casual' && 'on_the_move',
        'everyday_easy',
      ].filter(Boolean).find((candidate) => !used.has(candidate));
      used.add(archetypeId);
      return { optionId: option.optionId, archetypeId };
    }),
  };
}

function snapshotFrom(localProfileId, value) {
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    localProfileId,
    weatherSnapshotId: value.weatherSnapshotId,
    locationKey: value.locationKey,
    clothingPreference: value.context.clothingPreference,
    dressStyle: value.context.dressStyle,
    styleAesthetics: value.context.styleAesthetics ?? [],
    catalogVersion: value.context.catalogVersion,
    dayVariant: value.context.dayVariant,
    localDayKey: value.context.localDayKey ?? null,
    generationMode: value.recommendation.generationMode,
    recommendation: value.recommendation,
    createdAt: evening,
    updatedAt: evening,
  };
}

function createStore({ failSave = false } = {}) {
  const claims = new Set();
  let saved = null;
  return {
    claims,
    store: {
      async claim(localProfileId, dayKey) {
        const key = `${localProfileId}|${dayKey}`;
        if (claims.has(key)) return false;
        claims.add(key);
        return true;
      },
      async get(_localProfileId, dayKey) {
        return saved?.localDayKey === dayKey ? saved : null;
      },
      async save(localProfileId, value) {
        if (failSave) throw new Error('file unavailable');
        saved = snapshotFrom(localProfileId, value);
        return saved;
      },
    },
  };
}

function createClient({ fail = false } = {}) {
  const calls = { count: 0 };
  return {
    calls,
    client: {
      async recommendRouted(request) {
        calls.count += 1;
        if (fail) throw new Error('stylist unavailable');
        return mapWorkerAiRecommendation(request, picks(request), 'ai-assisted');
      },
    },
  };
}

function compose(input) {
  const { context } = createRecommendationContextWithPool(input, input.localDayKey);
  return { context, request: aiRequestFromContext(context) };
}

async function choosePreview(input = previewInput()) {
  const { store } = createStore();
  const { client } = createClient();
  const controller = new TomorrowPreviewController(profileId, { store, client, compose });
  await controller.ensure(input);
  return controller.getSnapshot();
}

test('the forecast must cover the whole window tomorrow morning is chosen for', () => {
  const departureAt = morning.toISOString();
  assert.equal(forecastCoversWindow(weather(), departureAt), true);
  // 19:00 tonight plus twelve hours stops at 07:00 tomorrow, before the 08:00 to 19:00 window.
  assert.equal(forecastCoversWindow(weather({ hours: 12 }), departureAt), false);
  // The 17:00 hour describes the window only up to 18:00, short of its 19:00 end; the
  // 18:00 hour reaches it.
  assert.equal(forecastCoversWindow(weather({ hours: 22 }), departureAt), false);
  assert.equal(forecastCoversWindow(weather({ hours: 23 }), departureAt), true);
});

test('one selection per day: concurrent and repeated asks join it, a restart reads it back', async () => {
  const { store } = createStore();
  const { calls, client } = createClient();
  const first = new TomorrowPreviewController(profileId, { store, client, compose });
  await Promise.all([first.ensure(previewInput()), first.ensure(previewInput())]);
  await first.ensure(previewInput());
  assert.equal(calls.count, 1);
  const chosen = first.getSnapshot();
  assert.equal(chosen.localDayKey, tomorrowKey);
  assert.equal(chosen.generationMode, 'ai-assisted');
  assert.equal(chosen.recommendation.outfits.length, 3);

  const restarted = new TomorrowPreviewController(profileId, { store, client, compose });
  await restarted.ensure(previewInput());
  assert.equal(calls.count, 1);
  assert.equal(restarted.getSnapshot(), chosen);
});

test('a spent claim with nothing stored selects nothing and shows nothing', async () => {
  const { claims, store } = createStore();
  claims.add(`${profileId}|${tomorrowKey}`);
  const { calls, client } = createClient();
  const controller = new TomorrowPreviewController(profileId, { store, client, compose });
  await controller.ensure(previewInput());
  assert.equal(calls.count, 0);
  assert.equal(controller.getSnapshot(), null);
});

test('a failed stylist answer keeps the deterministic three, a failed save shows nothing', async () => {
  const { store } = createStore();
  const failing = createClient({ fail: true });
  const fallback = new TomorrowPreviewController(profileId, { store, client: failing.client, compose });
  await fallback.ensure(previewInput());
  assert.equal(failing.calls.count, 1);
  assert.equal(fallback.getSnapshot().generationMode, 'deterministic-fallback');

  const broken = createStore({ failSave: true });
  const unsaved = new TomorrowPreviewController(profileId, { store: broken.store, client: createClient().client, compose });
  await assert.doesNotReject(unsaved.ensure(previewInput()));
  assert.equal(unsaved.getSnapshot(), null);
});

function morningContext(input = morningInput(), excludedOptionIds = []) {
  return createRecommendationContextWithPool({ ...input, excludedOptionIds }, input.localDayKey).context;
}

test('the morning reuses the preview only while every input and requirement is unchanged', async () => {
  const preview = await choosePreview();
  const location = 'manual:sample.istanbul';
  assert.equal(reusablePreviewRecommendation(preview, morningContext(), location), preview.recommendation);

  assert.equal(reusablePreviewRecommendation(preview, morningContext(), 'manual:sample.ankara'), null);
  assert.equal(reusablePreviewRecommendation(preview,
    morningContext(morningInput({ dressStyle: 'formal' })), location), null);
  assert.equal(reusablePreviewRecommendation(preview,
    morningContext(morningInput({ styleAesthetics: ['sporty'] })), location), null);
  assert.equal(reusablePreviewRecommendation(preview,
    morningContext(morningInput({ dayVariant: (localDayVariant(morning) + 1) % 7 })), location), null);
  const cold = morningInput({ snapshot: weather({ id: 'weather-cold', observedAt: morning.toISOString(),
    temperature: 3 }) });
  assert.equal(reusablePreviewRecommendation(preview, morningContext(cold), location), null);
  // Another dressing day's preview is never this day's answer.
  assert.equal(reusablePreviewRecommendation(preview,
    morningContext(morningInput({ localDayKey: '2026-10-03' })), location), null);
});

test('one predicate decides whether a preview still answers the question, for Today and the morning', async () => {
  const preview = await choosePreview();
  const question = {
    localDayKey: preview.localDayKey,
    locationKey: preview.locationKey,
    clothingPreference: preview.clothingPreference,
    dressStyle: preview.dressStyle,
    styleAesthetics: preview.styleAesthetics ?? [],
  };
  assert.equal(previewAnswersQuestion(preview, question), true);
  for (const changed of [
    { localDayKey: '2026-10-03' },
    { locationKey: 'manual:sample.ankara' },
    { clothingPreference: preview.clothingPreference === 'mens' ? 'womens' : 'mens' },
    { dressStyle: preview.dressStyle === 'formal' ? 'casual' : 'formal' },
    { styleAesthetics: ['sporty'] },
  ]) {
    assert.equal(previewAnswersQuestion(preview, { ...question, ...changed }), false);
  }
});

test('a pick the morning no longer offers, or a deterministic preview, asks again', async () => {
  const preview = await choosePreview();
  const location = 'manual:sample.istanbul';
  const shown = preview.recommendation.outfits.map(({ optionId }) => optionId);
  assert.equal(reusablePreviewRecommendation(preview, morningContext(morningInput(), shown), location), null);
  assert.equal(reusablePreviewRecommendation(
    { ...preview, recommendation: { ...preview.recommendation, generationMode: 'deterministic-fallback' } },
    morningContext(), location), null);
});

function createMainController({ preview }) {
  let stored = null;
  const { calls, client } = createClient();
  const controller = new RecommendationApplicationController(profileId, {
    loadRepository: async () => ({
      async getSnapshot() { return stored; },
      async saveSnapshot(localProfileId, value) {
        stored = snapshotFrom(localProfileId, value);
        return stored;
      },
    }),
    client,
    holdPhase: async () => undefined,
    reserveAiReask: async () => true,
    loadPreview: async (dayKey) => (preview?.localDayKey === dayKey ? preview : null),
  });
  return { calls, controller };
}

test('the morning generation saves the preview selection without asking the stylist again', async () => {
  const preview = await choosePreview();
  const { calls, controller } = createMainController({ preview });
  await controller.initialize(tomorrowKey);
  const snapshot = await controller.refresh('local-day-changed', morningInput());
  assert.equal(calls.count, 0);
  assert.equal(snapshot.generationMode, 'ai-assisted');
  assert.equal(snapshot.weatherSnapshotId, 'weather-morning');
  assert.deepEqual(snapshot.recommendation.outfits.map(({ optionId }) => optionId),
    preview.recommendation.outfits.map(({ optionId }) => optionId));
});

test('a changed morning, or the confirmed re-ask, still asks the stylist', async () => {
  const preview = await choosePreview();
  const changed = createMainController({ preview });
  await changed.controller.initialize(tomorrowKey);
  await changed.controller.refresh('dress-style-changed', morningInput({ dressStyle: 'formal' }));
  assert.equal(changed.calls.count, 1);

  const reask = createMainController({ preview });
  await reask.controller.initialize(tomorrowKey);
  await reask.controller.refresh('regenerate', morningInput());
  assert.equal(reask.calls.count, 1);
});
