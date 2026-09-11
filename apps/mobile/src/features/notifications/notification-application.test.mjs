import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationApplicationController } from './application/notification-application-controller.ts';
import { WeatherAlertScheduler } from './application/weather-alert-scheduler.ts';

function createGateway(permission, requestedPermission = permission) {
  let requestCount = 0;
  return {
    gateway: {
      getPermissionState: async () => permission,
      requestPermission: async () => {
        requestCount += 1;
        return requestedPermission;
      },
      openApplicationSettings: async () => undefined,
      cancelScheduledWeatherAlerts: async () => true,
      scheduleWeatherAlert: async () => true,
      subscribeToResponses: () => () => undefined,
    },
    getRequestCount: () => requestCount,
  };
}

test('granted permission after requesting persists opt-in', async () => {
  const { gateway } = createGateway(
    { kind: 'undetermined' },
    { kind: 'granted' },
  );
  const persisted = [];
  const controller = new NotificationApplicationController(
    gateway,
    async (optIn) => persisted.push(optIn),
  );

  assert.deepEqual(await controller.setOptIn(true), { outcome: 'enabled' });
  assert.deepEqual(persisted, [true]);
  assert.deepEqual(controller.getSnapshot(), {
    permission: { kind: 'granted' },
    isBusy: false,
  });
});

test('denied permission after requesting does not persist opt-in', async () => {
  const { gateway } = createGateway(
    { kind: 'undetermined' },
    { kind: 'denied', canRequestAgain: false },
  );
  const persisted = [];
  const controller = new NotificationApplicationController(
    gateway,
    async (optIn) => persisted.push(optIn),
  );

  assert.deepEqual(
    await controller.setOptIn(true),
    { outcome: 'blocked', canRequestAgain: false },
  );
  assert.deepEqual(persisted, []);
});

test('permission already denied does not request or persist opt-in', async () => {
  const { gateway, getRequestCount } = createGateway({
    kind: 'denied',
    canRequestAgain: false,
  });
  const persisted = [];
  const controller = new NotificationApplicationController(
    gateway,
    async (optIn) => persisted.push(optIn),
  );

  assert.deepEqual(
    await controller.setOptIn(true),
    { outcome: 'blocked', canRequestAgain: false },
  );
  assert.equal(getRequestCount(), 0);
  assert.deepEqual(persisted, []);
});

test('opting out persists false and refreshes permission', async () => {
  const { gateway } = createGateway({ kind: 'granted' });
  const persisted = [];
  const controller = new NotificationApplicationController(
    gateway,
    async (optIn) => persisted.push(optIn),
  );

  assert.deepEqual(await controller.setOptIn(false), { outcome: 'disabled' });
  assert.deepEqual(persisted, [false]);
  assert.deepEqual(controller.getSnapshot(), {
    permission: { kind: 'granted' },
    isBusy: false,
  });
});

test('a rejected persistence operation does not leave the controller busy', async () => {
  const failure = new Error('write failed');
  const { gateway } = createGateway({ kind: 'granted' });
  const controller = new NotificationApplicationController(
    gateway,
    async () => {
      throw failure;
    },
  );

  await assert.rejects(() => controller.setOptIn(true), (error) => error === failure);
  assert.equal(controller.getSnapshot().isBusy, false);
});

function weatherSnapshot(id = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4') {
  return {
    id,
    localProfileId: 'profile-id',
    locationKey: 'manual:sample.istanbul',
    timeZone: 'UTC',
    fetchedAt: '2026-09-09T15:00:00.000Z',
    origin: { kind: 'sample', sourceId: 'test' },
    current: {
      observedAt: '2026-09-09T15:00:00.000Z',
      temperatureCelsius: 16,
      apparentTemperatureCelsius: 16,
      condition: 'clear',
      precipitationProbability: 0,
      windSpeedMetersPerSecond: 2,
      humidity: 0.5,
      uvIndex: 1,
    },
    minimumTemperatureCelsius: 6,
    maximumTemperatureCelsius: 17,
    hourly: [{
      forecastAt: '2026-09-09T18:00:00.000Z',
      temperatureCelsius: 7,
      apparentTemperatureCelsius: 6.4,
      condition: 'rain',
      precipitationProbability: 0.8,
      windSpeedMetersPerSecond: 3,
      humidity: 0.7,
      uvIndex: 0,
    }],
  };
}

function createSchedulerHarness({ firedIds = new Set(), cancel, schedule } = {}) {
  const events = [];
  const scheduled = [];
  const upserted = [];
  const deletedPending = [];
  const pruned = [];
  const gateway = {
    ...createGateway({ kind: 'granted' }).gateway,
    cancelScheduledWeatherAlerts: cancel ?? (async () => {
      events.push('cancel');
      return true;
    }),
    scheduleWeatherAlert: async (request) => {
      events.push(`schedule:${request.identifier}`);
      scheduled.push(request);
      return schedule ? schedule(request) : true;
    },
  };
  const repository = {
    deletePending: async (localProfileId, now) => {
      events.push('delete-pending');
      deletedPending.push({ localProfileId, now });
    },
    listFiredIds: async () => {
      events.push('list-fired');
      return firedIds;
    },
    upsertScheduled: async (deliveries) => {
      events.push('upsert');
      upserted.push(deliveries);
    },
    pruneBefore: async (_localProfileId, isoDate) => {
      events.push('prune');
      pruned.push(isoDate);
    },
  };
  return {
    events, scheduled, upserted, deletedPending, pruned,
    scheduler: new WeatherAlertScheduler(
      gateway,
      repository,
      () => '2026-09-09T15:00:00.000Z',
    ),
  };
}

const enabledInput = {
  localProfileId: 'profile-id',
  snapshot: weatherSnapshot(),
  enabled: true,
  language: 'en',
};

test('weather alerts cancel before planning, schedule localized copy, persist, and prune', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule(enabledInput);

  assert.equal(harness.events[0], 'cancel');
  assert.deepEqual(harness.events, [
    'cancel',
    'delete-pending',
    'list-fired',
    'schedule:precipitation_onset:manual:sample.istanbul:2026-09-09',
    'schedule:temperature_swing:manual:sample.istanbul:2026-09-09',
    'upsert',
    'prune',
  ]);
  assert.deepEqual(harness.scheduled.map(({ title, body }) => ({ title, body })), [
    {
      title: 'Rain is on the way',
      body: 'Rain is expected around 18:00. Take something waterproof with you.',
    },
    {
      title: 'It will feel colder',
      body: 'Around 18:00, it will feel like 6°C. Take a warmer layer with you.',
    },
  ]);
  assert.equal(harness.upserted[0].length, 2);
  assert.deepEqual(harness.deletedPending, [{
    localProfileId: 'profile-id',
    now: '2026-09-09T15:00:00.000Z',
  }]);
  assert.equal(harness.pruned[0], '2026-09-06T15:00:00.000Z');
});

test('weather alerts suppress identities whose ledger fire time has passed', async () => {
  const firedIds = new Set([
    'precipitation_onset:manual:sample.istanbul:2026-09-09',
  ]);
  const harness = createSchedulerHarness({ firedIds });

  await harness.scheduler.reschedule(enabledInput);

  assert.deepEqual(
    harness.scheduled.map(({ identifier }) => identifier),
    ['temperature_swing:manual:sample.istanbul:2026-09-09'],
  );
  assert.deepEqual(
    harness.upserted[0].map(({ id }) => id),
    ['temperature_swing:manual:sample.istanbul:2026-09-09'],
  );
});

test('weather alert copy follows the active Turkish language', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({
    ...enabledInput,
    snapshot: { ...enabledInput.snapshot, timeZone: 'Europe/Istanbul' },
    language: 'tr',
  });

  assert.deepEqual(harness.scheduled.map(({ title, body }) => ({ title, body })), [
    {
      title: 'Yağmur geliyor',
      body: 'Saat 21:00 civarında yağmur bekleniyor. Yanına su geçirmez bir parça al.',
    },
    {
      title: 'Hava daha soğuk hissedilecek',
      body: 'Saat 21:00 civarında hissedilen sıcaklık 6°C olacak. Yanına daha sıcak tutan bir kat al.',
    },
  ]);
});

test('disabled weather alerts cancel and delete pending ledger rows without reading or upserting', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({ ...enabledInput, enabled: false });

  assert.deepEqual(harness.events, ['cancel', 'delete-pending']);
});

test('a missing weather snapshot cancels and deletes pending ledger rows without reading or upserting', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({ ...enabledInput, snapshot: null });

  assert.deepEqual(harness.events, ['cancel', 'delete-pending']);
});

test('a concurrent reschedule waits for the active run and then runs once', async () => {
  let releaseFirstCancel;
  let cancelCount = 0;
  const firstCancel = new Promise((resolve) => { releaseFirstCancel = resolve; });
  const harness = createSchedulerHarness({
    cancel: async () => {
      cancelCount += 1;
      if (cancelCount === 1) await firstCancel;
    },
  });

  const first = harness.scheduler.reschedule({ ...enabledInput, enabled: false });
  const second = harness.scheduler.reschedule({
    ...enabledInput,
    enabled: false,
    language: 'tr',
  });
  assert.equal(cancelCount, 1);
  releaseFirstCancel();
  await Promise.all([first, second]);

  assert.equal(cancelCount, 2);
});

test('a stale snapshot leaves the existing schedule and ledger untouched', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({
    ...enabledInput,
    snapshot: { ...enabledInput.snapshot, fetchedAt: '2026-09-09T14:00:00.000Z' },
  });

  assert.deepEqual(harness.events, []);
});

test('opting out still cancels and clears pending rows from a stale snapshot', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({
    ...enabledInput,
    enabled: false,
    snapshot: { ...enabledInput.snapshot, fetchedAt: '2026-09-09T14:00:00.000Z' },
  });

  assert.deepEqual(harness.events, ['cancel', 'delete-pending']);
});

test('a failed cancellation aborts the reschedule before the ledger is touched', async () => {
  const harness = createSchedulerHarness({ cancel: async () => false });

  await harness.scheduler.reschedule(enabledInput);

  assert.deepEqual(harness.events, []);
});

test('the ledger records only the alerts the OS accepted', async () => {
  const harness = createSchedulerHarness({
    schedule: (request) => request.identifier.startsWith('precipitation_onset'),
  });

  await harness.scheduler.reschedule(enabledInput);

  assert.deepEqual(
    harness.upserted[0].map(({ id }) => id),
    ['precipitation_onset:manual:sample.istanbul:2026-09-09'],
  );
});
