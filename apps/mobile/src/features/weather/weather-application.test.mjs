import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import ts from 'typescript';

import { WeatherApplicationController } from './application/weather-application-controller.ts';
import { DeterministicFakeWeatherProvider } from './data/deterministic-fake-weather-provider.ts';
import { getManualLocation } from './data/manual-location-catalog.ts';
import { WeatherProviderError } from './data/weather-provider.ts';
import { WorkerWeatherProvider } from './data/worker-weather-provider.ts';

const nativeModuleMocks = new Map([
  ['expo-crypto', 'export function randomUUID() { return "test-id"; }'],
  ['expo-location', `
    export const Accuracy = { Low: 1 };
    export const PermissionStatus = { UNDETERMINED: 'undetermined' };
  `],
  ['expo-sqlite', 'export async function openDatabaseAsync() { throw new Error("unused"); }'],
  ['react-native', `
    export const AppState = { currentState: 'active', addEventListener() { return { remove() {} }; } };
    export const Linking = { openSettings() { return Promise.resolve(); } };
    export const Platform = { OS: 'ios' };
  `],
]);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const mock = nativeModuleMocks.get(specifier);
    if (mock) {
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(mock)}`,
      };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (
      url.endsWith('/application/weather-application-provider.tsx')
      || url.endsWith('/infrastructure/sqlite/expo-sqlite-database.ts')
    ) {
      const source = readFileSync(new URL(url), 'utf8');
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(source, {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
      };
    }
    return nextLoad(url, context);
  },
});

const profileId = 'profile-id';

function snapshotFor(location, fetchedAt, temperature = 15) {
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: profileId,
    locationKey: location.locationKey, timeZone: location.timeZone, fetchedAt,
    origin: { kind: 'sample', sourceId: 'test' },
    current: {
      observedAt: fetchedAt, temperatureCelsius: temperature,
      apparentTemperatureCelsius: temperature - 1, condition: 'clear',
      precipitationProbability: 0.1, windSpeedMetersPerSecond: 2,
      humidity: 0.5, uvIndex: 3,
    },
    minimumTemperatureCelsius: temperature - 4,
    maximumTemperatureCelsius: temperature + 4,
    hourly: [{
      forecastAt: fetchedAt, temperatureCelsius: temperature,
      apparentTemperatureCelsius: temperature - 1, condition: 'clear',
      precipitationProbability: 0.1, windSpeedMetersPerSecond: 2,
      humidity: 0.5, uvIndex: 3,
    }],
  };
}

function providedFor(location, fetchedAt, temperature = 15) {
  const { id: _id, localProfileId: _profile, ...provided } = snapshotFor(location, fetchedAt, temperature);
  return provided;
}

function createHarness({
  active = null,
  snapshots = [],
  now = '2026-07-30T10:00:00.000Z',
  provider,
  permissionState = { kind: 'undetermined' },
  requestedPermission = { kind: 'granted', accuracy: 'approximate' },
  locationResult,
  snapshotReadFailureFor = null,
} = {}) {
  const currentTime = () => typeof now === 'function' ? now() : now;
  const byKey = new Map(snapshots.map((entry) => [entry.locationKey, entry]));
  const calls = { permissionRequests: 0, lookups: 0, settings: 0, provider: 0 };
  let activeLocation = active;
  const repository = {
    async getActiveLocation() { return activeLocation; },
    async setActiveLocation(_profile, location) { activeLocation = location; return location; },
    async getSnapshot(_profile, key) {
      if (key === snapshotReadFailureFor) throw new Error('snapshot read failed');
      return byKey.get(key) ?? null;
    },
    async saveSnapshot(_profile, provided) {
      const saved = { ...provided, id: `saved-${calls.provider}`, localProfileId: profileId };
      byKey.set(saved.locationKey, saved);
      return saved;
    },
  };
  const deviceLocation = {
    async getPermissionState() { return permissionState; },
    async requestForegroundPermission() { calls.permissionRequests += 1; return requestedPermission; },
    async getCurrentLocation() {
      calls.lookups += 1;
      return locationResult ?? {
        kind: 'success',
        location: {
          source: 'device', accuracy: 'approximate', locationKey: 'device:4101:2898',
          coordinates: { latitudeE2: 4101, longitudeE2: 2898 }, timeZone: 'Europe/Istanbul',
        },
      };
    },
    async openApplicationSettings() { calls.settings += 1; },
  };
  const weatherProvider = provider ?? {
    async fetchSnapshot(location) {
      calls.provider += 1;
      return providedFor(location, currentTime(), 18);
    },
  };
  const wrappedProvider = {
    async fetchSnapshot(location) {
      if (provider) calls.provider += 1;
      return weatherProvider.fetchSnapshot(location);
    },
  };
  const controller = new WeatherApplicationController(profileId, {
    loadRepository: async () => repository,
    provider: wrappedProvider,
    deviceLocation,
    now: currentTime,
  });
  return { controller, calls, repository, byKey };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('bootstrap with no active location never requests permission or weather', async () => {
  const { controller, calls } = createHarness();
  await controller.initialize();
  assert.equal(controller.getSnapshot().status, 'ready');
  assert.equal(controller.getSnapshot().activeLocation, null);
  assert.deepEqual(calls, { permissionRequests: 0, lookups: 0, settings: 0, provider: 0 });
});

test('weather bootstrap degrades missing production configuration to retryable unavailable state', async () => {
  const configuredUrl = process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL;
  const isDevelopment = globalThis.__DEV__;
  delete process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL;
  globalThis.__DEV__ = false;

  try {
    let providerModule;
    await assert.doesNotReject(async () => {
      providerModule = await import('./application/weather-application-provider.tsx');
    });

    process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL = 'https://weather.example.com';
    assert.ok(providerModule.createWeatherProvider() instanceof WorkerWeatherProvider);

    delete process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL;
    let provider;
    assert.doesNotThrow(() => {
      provider = providerModule.createWeatherProvider();
    });
    const istanbul = getManualLocation('sample.istanbul');
    await assert.rejects(
      () => provider.fetchSnapshot(istanbul),
      (error) => error instanceof WeatherProviderError && error.kind === 'service',
    );

    const harness = createHarness({ active: istanbul, provider });
    await harness.controller.initialize();
    await settle();
    assert.equal(harness.controller.getSnapshot().refreshFailure, 'unavailable');
    assert.equal(harness.calls.provider, 1);

    await harness.controller.refresh();
    assert.equal(harness.controller.getSnapshot().refreshFailure, 'unavailable');
    assert.equal(harness.calls.provider, 2);
  } finally {
    if (configuredUrl === undefined) delete process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL;
    else process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL = configuredUrl;
    if (isDevelopment === undefined) delete globalThis.__DEV__;
    else globalThis.__DEV__ = isDevelopment;
  }
});

test('device selection shows rationale before requesting and accepts approximate success', async () => {
  const { controller, calls } = createHarness();
  await controller.initialize();
  await controller.beginDeviceLocationSelection();
  assert.equal(controller.getSnapshot().locationFlow, 'rationale');
  assert.equal(calls.permissionRequests, 0);
  await controller.confirmDeviceLocationRequest();
  await settle();
  assert.equal(calls.permissionRequests, 1);
  assert.equal(calls.lookups, 1);
  assert.equal(controller.getSnapshot().activeLocation.source, 'device');
  assert.equal(controller.getSnapshot().activeLocation.accuracy, 'approximate');
  assert.equal(controller.getSnapshot().snapshot.locationKey, 'device:4101:2898');
});

test('fresh cache is immediate, while stale bootstrap deduplicates refresh and keeps cache on failure', async () => {
  const istanbul = getManualLocation('sample.istanbul');
  const fresh = snapshotFor(istanbul, '2026-07-30T09:45:00.000Z');
  const freshHarness = createHarness({ active: istanbul, snapshots: [fresh] });
  await freshHarness.controller.initialize();
  assert.equal(freshHarness.controller.getSnapshot().freshness, 'fresh');
  assert.equal(freshHarness.calls.provider, 0);

  let rejectRequest;
  const deferredFailure = new Promise((_resolve, reject) => { rejectRequest = reject; });
  const stale = snapshotFor(istanbul, '2026-07-30T09:29:59.999Z');
  const staleHarness = createHarness({
    active: istanbul,
    snapshots: [stale],
    provider: { fetchSnapshot: async () => deferredFailure },
  });
  await staleHarness.controller.initialize();
  const first = staleHarness.controller.refresh();
  const second = staleHarness.controller.onForeground();
  assert.equal(staleHarness.calls.provider, 1);
  rejectRequest(new Error('offline'));
  await Promise.all([first, second]);
  assert.equal(staleHarness.controller.getSnapshot().snapshot.fetchedAt, stale.fetchedAt);
  assert.equal(staleHarness.controller.getSnapshot().freshness, 'stale');
  assert.equal(staleHarness.controller.getSnapshot().refreshFailure, 'unavailable');
});

test('foreground publishes newly stale freshness before a failed refresh', async () => {
  const istanbul = getManualLocation('sample.istanbul');
  const cached = snapshotFor(istanbul, '2026-07-30T09:30:00.000Z');
  let now = '2026-07-30T10:00:00.000Z';
  const harness = createHarness({
    active: istanbul,
    snapshots: [cached],
    now: () => now,
    provider: { fetchSnapshot: async () => { throw new WeatherProviderError('network'); } },
  });
  await harness.controller.initialize();
  assert.equal(harness.controller.getSnapshot().freshness, 'fresh');

  now = '2026-07-30T10:00:00.001Z';
  await harness.controller.onForeground();
  assert.equal(harness.controller.getSnapshot().freshness, 'stale');
  assert.equal(harness.controller.getSnapshot().snapshot.fetchedAt, cached.fetchedAt);
});

test('reselecting the active location preserves its snapshot when the cache read fails', async () => {
  const istanbul = getManualLocation('sample.istanbul');
  const cached = snapshotFor(istanbul, '2026-07-30T09:45:00.000Z');
  const harness = createHarness({ active: istanbul, snapshots: [cached] });
  await harness.controller.initialize();
  harness.repository.getSnapshot = async () => { throw new Error('snapshot read failed'); };

  await harness.controller.selectManualLocation('sample.istanbul');
  assert.equal(harness.controller.getSnapshot().snapshot.fetchedAt, cached.fetchedAt);
  assert.equal(harness.controller.getSnapshot().freshness, 'fresh');
});

test('changing location clears the previous location snapshot when the cache read fails', async () => {
  const istanbul = getManualLocation('sample.istanbul');
  const london = getManualLocation('sample.london');
  const harness = createHarness({
    active: istanbul,
    snapshots: [snapshotFor(istanbul, '2026-07-30T09:45:00.000Z')],
  });
  await harness.controller.initialize();
  harness.repository.getSnapshot = async () => { throw new Error('snapshot read failed'); };

  await harness.controller.selectManualLocation('sample.london');
  assert.equal(harness.controller.getSnapshot().activeLocation.locationKey, london.locationKey);
  assert.equal(harness.controller.getSnapshot().snapshot, null);
  assert.equal(harness.controller.getSnapshot().freshness, null);
});

test('manual refresh bypasses freshness and an old request cannot replace a newly active location', async () => {
  const istanbul = getManualLocation('sample.istanbul');
  const ankara = getManualLocation('sample.ankara');
  let resolveIstanbul;
  const oldRequest = new Promise((resolve) => { resolveIstanbul = resolve; });
  const harness = createHarness({
    active: istanbul,
    snapshots: [snapshotFor(istanbul, '2026-07-30T09:50:00.000Z')],
    now: '2026-07-30T10:05:00.000Z',
    provider: {
      fetchSnapshot: (location) => location.locationKey === istanbul.locationKey
        ? oldRequest
        : Promise.resolve(providedFor(location, '2026-07-30T10:01:00.000Z', 12)),
    },
  });
  await harness.controller.initialize();
  const forced = harness.controller.refresh();
  await harness.controller.selectManualLocation('sample.ankara');
  await settle();
  assert.equal(harness.controller.getSnapshot().activeLocation.locationKey, ankara.locationKey);
  assert.equal(harness.controller.getSnapshot().snapshot.locationKey, ankara.locationKey);
  resolveIstanbul(providedFor(istanbul, '2026-07-30T10:02:00.000Z', 20));
  await forced;
  assert.equal(harness.controller.getSnapshot().activeLocation.locationKey, ankara.locationKey);
  assert.equal(harness.controller.getSnapshot().snapshot.locationKey, ankara.locationKey);
  assert.equal(harness.byKey.get(istanbul.locationKey).current.temperatureCelsius, 20);
});

test('a committed location remains active when its follow-up cache read fails', async () => {
  const london = getManualLocation('sample.london');
  const harness = createHarness({ snapshotReadFailureFor: london.locationKey });
  await harness.controller.initialize();
  await harness.controller.selectManualLocation('sample.london');
  assert.equal(harness.controller.getSnapshot().activeLocation.locationKey, london.locationKey);
  assert.equal(harness.controller.getSnapshot().snapshot, null);
  assert.equal(harness.controller.getSnapshot().refreshFailure, 'unavailable');
  assert.equal(harness.controller.getSnapshot().locationFlow, 'idle');
});

test('requestable and permanent denial, services failure, and Settings remain explicit', async () => {
  const requestable = createHarness({ requestedPermission: { kind: 'denied', canRequestAgain: true } });
  await requestable.controller.initialize();
  await requestable.controller.beginDeviceLocationSelection();
  await requestable.controller.confirmDeviceLocationRequest();
  assert.equal(requestable.controller.getSnapshot().locationFlow, 'denied-requestable');

  const permanent = createHarness({ permissionState: { kind: 'denied', canRequestAgain: false } });
  await permanent.controller.initialize();
  await permanent.controller.beginDeviceLocationSelection();
  assert.equal(permanent.controller.getSnapshot().locationFlow, 'denied-permanent');
  assert.equal(permanent.calls.permissionRequests, 0);
  await permanent.controller.openApplicationSettings();
  assert.equal(permanent.calls.settings, 1);

  const services = createHarness({
    permissionState: { kind: 'granted', accuracy: 'approximate' },
    locationResult: { kind: 'services-unavailable' },
  });
  await services.controller.initialize();
  await services.controller.beginDeviceLocationSelection();
  assert.equal(services.controller.getSnapshot().locationFlow, 'services-unavailable');
});

test('future or corrupt cache is not displayed and no-cache failure is explicit', async () => {
  const istanbul = getManualLocation('sample.istanbul');
  const future = snapshotFor(istanbul, '2026-07-30T10:01:00.000Z');
  const harness = createHarness({
    active: istanbul,
    snapshots: [future],
    provider: { fetchSnapshot: async () => { throw new WeatherProviderError('network'); } },
  });
  await harness.controller.initialize();
  await settle();
  assert.equal(harness.controller.getSnapshot().snapshot, null);
  assert.equal(harness.controller.getSnapshot().refreshFailure, 'offline');
});

test('a network failure with no cached snapshot is offline and preserves the active location', async () => {
  const istanbul = getManualLocation('sample.istanbul');
  const harness = createHarness({
    active: istanbul,
    provider: { fetchSnapshot: async () => { throw new WeatherProviderError('network'); } },
  });

  await harness.controller.initialize();
  await settle();
  assert.equal(harness.controller.getSnapshot().snapshot, null);
  assert.equal(harness.controller.getSnapshot().refreshFailure, 'offline');
  assert.equal(harness.controller.getSnapshot().activeLocation.locationKey, istanbul.locationKey);
});

test('provider failures preserve a cached stale snapshot and active location for both outcomes', async () => {
  const istanbul = getManualLocation('sample.istanbul');
  const stale = snapshotFor(istanbul, '2026-07-30T09:29:59.999Z');
  const cases = [
    ['network', 'offline'],
    ['service', 'unavailable'],
    ['invalid-response', 'unavailable'],
    ['rate-limited', 'rate-limited'],
  ];

  for (const [providerFailure, refreshFailure] of cases) {
    const harness = createHarness({
      active: istanbul,
      snapshots: [stale],
      provider: {
        fetchSnapshot: async () => { throw new WeatherProviderError(providerFailure); },
      },
    });
    await harness.controller.initialize();
    await settle();
    const state = harness.controller.getSnapshot();
    assert.equal(state.activeLocation.locationKey, istanbul.locationKey);
    assert.equal(state.snapshot.fetchedAt, stale.fetchedAt);
    assert.equal(state.freshness, 'stale');
    assert.equal(state.refreshFailure, refreshFailure);
  }
});

test('a cacheless service failure is unavailable and retry clears only after success', async () => {
  const istanbul = getManualLocation('sample.istanbul');
  const outcomes = [
    new WeatherProviderError('service'),
    new WeatherProviderError('network'),
    providedFor(istanbul, '2026-07-30T10:00:00.000Z', 17),
  ];
  const harness = createHarness({
    active: istanbul,
    provider: {
      async fetchSnapshot() {
        const outcome = outcomes.shift();
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
  });

  await harness.controller.initialize();
  await settle();
  assert.equal(harness.controller.getSnapshot().refreshFailure, 'unavailable');
  assert.equal(harness.controller.getSnapshot().snapshot, null);
  assert.equal(harness.controller.getSnapshot().activeLocation.locationKey, istanbul.locationKey);

  await harness.controller.refresh();
  assert.equal(harness.controller.getSnapshot().refreshFailure, 'offline');
  assert.equal(harness.controller.getSnapshot().snapshot, null);
  assert.equal(harness.controller.getSnapshot().activeLocation.locationKey, istanbul.locationKey);

  await harness.controller.refresh();
  assert.equal(harness.controller.getSnapshot().refreshFailure, null);
  assert.equal(harness.controller.getSnapshot().snapshot.current.temperatureCelsius, 17);
  assert.equal(harness.controller.getSnapshot().activeLocation.locationKey, istanbul.locationKey);
});

test('deterministic fake supports delay, failure, hourly data, and later refresh times', async () => {
  const istanbul = getManualLocation('sample.istanbul');
  let now = '2026-07-30T10:00:00.000Z';
  let delayed = 0;
  const provider = new DeterministicFakeWeatherProvider({
    now: () => now,
    delay: async () => { delayed += 1; },
    scenarios: { [istanbul.locationKey]: ['delayed-success', 'success', 'failure'] },
  });
  const first = await provider.fetchSnapshot(istanbul);
  assert.equal(delayed, 1);
  assert.ok(first.hourly.length > 0);
  assert.equal(first.origin.kind, 'sample');
  now = '2026-07-30T10:05:00.000Z';
  const second = await provider.fetchSnapshot(istanbul);
  assert.equal(second.fetchedAt, now);
  await assert.rejects(() => provider.fetchSnapshot(istanbul));
});

test('Expo and raw coordinate details remain isolated to the device adapter', async () => {
  const [adapter, controller, screen, repository] = await Promise.all([
    readFile(new URL('./data/expo-device-location-gateway.ts', import.meta.url), 'utf8'),
    readFile(new URL('./application/weather-application-controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('./presentation/weather-screen.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./data/weather-repository.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(adapter, /expo-location/);
  assert.match(adapter, /Accuracy\.Low/);
  assert.match(adapter, /mayShowUserSettingsDialog: false/);
  assert.doesNotMatch(`${controller}${screen}${repository}`, /expo-location|coords\.latitude|coords\.longitude/);
  assert.doesNotMatch(`${adapter}${controller}${screen}${repository}`, /console\.(log|warn|error).*coord/i);
});

test('native config requests only localized foreground location with reduced accuracy by default', async () => {
  const [appSource, englishSource, turkishSource] = await Promise.all([
    readFile(new URL('../../../app.json', import.meta.url), 'utf8'),
    readFile(new URL('../../localization/native/en.json', import.meta.url), 'utf8'),
    readFile(new URL('../../localization/native/tr.json', import.meta.url), 'utf8'),
  ]);
  const app = JSON.parse(appSource).expo;
  const locationPlugin = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location');
  assert.ok(locationPlugin);
  assert.equal(locationPlugin[1].locationAlwaysAndWhenInUsePermission, false);
  assert.equal(locationPlugin[1].locationAlwaysPermission, false);
  assert.equal(locationPlugin[1].isIosBackgroundLocationEnabled, false);
  assert.equal(locationPlugin[1].isAndroidBackgroundLocationEnabled, false);
  assert.equal(locationPlugin[1].isAndroidForegroundServiceEnabled, false);
  assert.equal(app.ios.infoPlist.NSLocationDefaultAccuracyReduced, true);
  for (const permission of [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
  ]) assert.ok(app.android.blockedPermissions.includes(permission));
  assert.ok(JSON.parse(englishSource).ios.NSLocationWhenInUseUsageDescription);
  assert.ok(JSON.parse(turkishSource).ios.NSLocationWhenInUseUsageDescription);
});
