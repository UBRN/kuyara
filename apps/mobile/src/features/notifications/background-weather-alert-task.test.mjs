import assert from 'node:assert/strict';
import test from 'node:test';

import { runBackgroundWeatherAlertTask } from './data/background-weather-alert-task.ts';
import { weatherAlertBackgroundLeadTimeMinutes } from './domain/weather-alerts.ts';

const now = '2026-09-09T09:00:00.000Z';
const profile = {
  id: 'profile-id',
  gender: 'woman',
  dressStyle: 'smart',
  birthDate: null,
  languagePreference: 'system',
  themePreference: 'system',
  onboardingCompleted: true,
  notificationsOptIn: true,
  createdAt: '2026-09-09T08:00:00.000Z',
  updatedAt: '2026-09-09T08:00:00.000Z',
};
const location = {
  source: 'manual',
  catalogId: 'sample.istanbul',
  displayName: 'Istanbul',
  locationKey: 'manual:sample.istanbul',
  coordinates: { latitudeE2: 4101, longitudeE2: 2898 },
  timeZone: 'Europe/Istanbul',
};
const provided = {
  locationKey: location.locationKey,
  timeZone: location.timeZone,
  fetchedAt: now,
  origin: { kind: 'sample', sourceId: 'test' },
  current: {
    observedAt: now,
    temperatureCelsius: 16,
    apparentTemperatureCelsius: 16,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 2,
    humidity: 0.5,
    uvIndex: 1,
  },
  minimumTemperatureCelsius: 8,
  maximumTemperatureCelsius: 18,
  hourly: [{
    forecastAt: '2026-09-09T10:00:00.000Z',
    temperatureCelsius: 12,
    apparentTemperatureCelsius: 8,
    condition: 'rain',
    precipitationProbability: 0.8,
    windSpeedMetersPerSecond: 3,
    humidity: 0.7,
    uvIndex: 0,
  }],
};

function createHarness({ cached = null, ...overrides } = {}) {
  const calls = [];
  const saved = { id: 'snapshot-id', localProfileId: profile.id, ...provided };
  const repository = {
    getActiveLocation: async () => {
      calls.push('get-location');
      return location;
    },
    getSnapshot: async () => {
      calls.push('get-cached-snapshot');
      return cached;
    },
    saveSnapshot: async (_localProfileId, snapshot) => {
      calls.push('save-snapshot');
      return { ...saved, ...snapshot };
    },
  };
  const dependencies = {
    loadProfile: async () => profile,
    loadWeatherRepository: async () => {
      calls.push('load-weather-repository');
      return repository;
    },
    provider: {
      fetchSnapshot: async () => {
        calls.push('fetch-snapshot');
        return provided;
      },
    },
    getNotificationPermission: async () => {
      calls.push('get-permission');
      return { kind: 'granted' };
    },
    reschedule: async (input) => {
      calls.push('reschedule');
      calls.push(input);
    },
    getDeviceLocale: () => 'tr-TR',
    now: () => now,
    ...overrides,
  };
  return { calls, dependencies, repository, saved };
}

test('refreshes, validates, persists, and reschedules through the existing input shape', async () => {
  const harness = createHarness();

  assert.equal(await runBackgroundWeatherAlertTask(harness.dependencies), 'success');
  assert.deepEqual(harness.calls.slice(0, -1), [
    'get-permission',
    'load-weather-repository',
    'get-location',
    'get-cached-snapshot',
    'fetch-snapshot',
    'save-snapshot',
    'reschedule',
  ]);
  assert.deepEqual(harness.calls.at(-1), {
    localProfileId: profile.id,
    snapshot: harness.saved,
    enabled: true,
    language: 'tr',
    leadTimeMinutes: weatherAlertBackgroundLeadTimeMinutes,
  });
});

test('a still-fresh cached snapshot reschedules without spending a provider request', async () => {
  const harness = createHarness({
    cached: { id: 'cached-id', localProfileId: profile.id, ...provided },
  });

  assert.equal(await runBackgroundWeatherAlertTask(harness.dependencies), 'success');
  assert.equal(harness.calls.includes('fetch-snapshot'), false);
  assert.equal(harness.calls.includes('save-snapshot'), false);
  assert.equal(harness.calls.at(-1).snapshot.id, 'cached-id');
});

test('a stale cached snapshot still refreshes from the provider', async () => {
  const harness = createHarness({
    cached: {
      id: 'cached-id',
      localProfileId: profile.id,
      ...provided,
      fetchedAt: '2026-09-09T08:00:00.000Z',
    },
  });

  assert.equal(await runBackgroundWeatherAlertTask(harness.dependencies), 'success');
  assert.equal(harness.calls.includes('fetch-snapshot'), true);
  assert.equal(harness.calls.at(-1).snapshot.id, 'snapshot-id');
});

for (const scenario of [
  { name: 'missing profile', overrides: { loadProfile: async () => null } },
  {
    name: 'notifications opt-out',
    overrides: { loadProfile: async () => ({ ...profile, notificationsOptIn: false }) },
  },
  {
    name: 'notification permission not granted',
    overrides: { getNotificationPermission: async () => ({ kind: 'undetermined' }) },
  },
  {
    name: 'missing active location',
    repository: { getActiveLocation: async () => null },
  },
]) {
  test(`${scenario.name} is a successful no-op before provider and scheduler calls`, async () => {
    const harness = createHarness(scenario.overrides);
    if (scenario.repository) {
      harness.dependencies.loadWeatherRepository = async () => scenario.repository;
    }

    assert.equal(await runBackgroundWeatherAlertTask(harness.dependencies), 'success');
    assert.equal(harness.calls.includes('fetch-snapshot'), false);
    assert.equal(harness.calls.includes('reschedule'), false);
  });
}

for (const [name, invalidSnapshot] of [
  ['location key mismatch', { ...provided, locationKey: 'manual:sample.ankara' }],
  ['time zone mismatch', { ...provided, timeZone: 'UTC' }],
  ['invalid future fetch time', { ...provided, fetchedAt: '2026-09-09T09:02:00.001Z' }],
]) {
  test(`${name} fails before persistence`, async () => {
    const harness = createHarness({
      provider: { fetchSnapshot: async () => invalidSnapshot },
    });

    assert.equal(await runBackgroundWeatherAlertTask(harness.dependencies), 'failed');
    assert.equal(harness.calls.includes('save-snapshot'), false);
    assert.equal(harness.calls.includes('reschedule'), false);
  });
}

test('provider and repository failures resolve as failed outcomes', async (t) => {
  await t.test('provider failure', async () => {
    const harness = createHarness({
      provider: { fetchSnapshot: async () => { throw new Error('provider failed'); } },
    });
    assert.equal(await runBackgroundWeatherAlertTask(harness.dependencies), 'failed');
  });

  await t.test('repository failure', async () => {
    const harness = createHarness({
      loadWeatherRepository: async () => { throw new Error('repository failed'); },
    });
    assert.equal(await runBackgroundWeatherAlertTask(harness.dependencies), 'failed');
  });
});
