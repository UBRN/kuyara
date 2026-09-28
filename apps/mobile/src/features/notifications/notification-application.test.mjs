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

function createSchedulerHarness({ firedIds = new Set(), cancel, schedule, now = '2026-09-09T15:00:00.000Z' } = {}) {
  const events = [];
  const scheduled = [];
  const upserted = [];
  const deletedPending = [];
  const pruned = [];
  const gateway = {
    ...createGateway({ kind: 'granted' }).gateway,
    cancelScheduledWeatherAlerts: cancel ?? (async (kind) => {
      events.push(kind ? `cancel:${kind}` : 'cancel');
      return true;
    }),
    scheduleWeatherAlert: async (request) => {
      events.push(`schedule:${request.identifier}`);
      scheduled.push(request);
      return schedule ? schedule(request) : true;
    },
  };
  const repository = {
    deletePending: async (localProfileId, now, kind) => {
      events.push(kind ? `delete-pending:${kind}` : 'delete-pending');
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
      () => now,
    ),
  };
}

const enabledInput = {
  localProfileId: 'profile-id',
  snapshot: weatherSnapshot(),
  weatherAlertsEnabled: true,
  morningBriefingEnabled: false,
  language: 'en',
  hour12: false,
  temperatureUnit: 'celsius',
};

test('weather alerts cancel before planning, schedule localized copy, persist, and prune', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule(enabledInput);

  assert.equal(harness.events[0], 'cancel');
  assert.deepEqual(harness.events, [
    'cancel',
    'delete-pending',
    'list-fired',
    'schedule:precipitation_onset:manual:sample.istanbul:2026-09-09:evening',
    'schedule:temperature_swing:manual:sample.istanbul:2026-09-09:evening',
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

// ADR 0004: the briefing goes through the same gateway and the same ledger, and its own
// opt-in decides it: alerts off and briefing on still schedules exactly one notification.
test('the morning briefing is scheduled beside the alerts, on its own opt-in', async () => {
  const withTomorrow = {
    ...weatherSnapshot(),
    hourly: [
      ...weatherSnapshot().hourly,
      {
        forecastAt: '2026-09-10T07:00:00.000Z',
        temperatureCelsius: 11,
        apparentTemperatureCelsius: 10,
        condition: 'cloudy',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 2,
        humidity: 0.6,
        uvIndex: 0,
      },
    ],
  };
  const both = createSchedulerHarness();
  await both.scheduler.reschedule({
    ...enabledInput,
    snapshot: withTomorrow,
    morningBriefingEnabled: true,
  });

  assert.deepEqual(both.scheduled.map(({ identifier }) => identifier), [
    'precipitation_onset:manual:sample.istanbul:2026-09-09:evening',
    'temperature_swing:manual:sample.istanbul:2026-09-09:evening',
    'morning_briefing:2026-09-10',
  ]);
  assert.deepEqual(both.scheduled.at(-1), {
    identifier: 'morning_briefing:2026-09-10',
    fireAt: '2026-09-10T07:00:00.000Z',
    title: 'Good morning',
    body: 'A cloudy morning at 11\u00b0C. Your outfit for today is waiting in kuyara.',
  });
  assert.deepEqual(both.upserted[0].map(({ id }) => id), [
    'precipitation_onset:manual:sample.istanbul:2026-09-09:evening',
    'temperature_swing:manual:sample.istanbul:2026-09-09:evening',
    'morning_briefing:2026-09-10',
  ]);

  const briefingOnly = createSchedulerHarness();
  await briefingOnly.scheduler.reschedule({
    ...enabledInput,
    snapshot: {
      ...withTomorrow,
      hourly: [
        ...withTomorrow.hourly,
        {
          forecastAt: '2026-09-10T10:00:00.000Z',
          temperatureCelsius: 17.4,
          apparentTemperatureCelsius: 17,
          condition: 'clear',
          precipitationProbability: 0,
          windSpeedMetersPerSecond: 2,
          humidity: 0.4,
          uvIndex: 2,
        },
      ],
    },
    weatherAlertsEnabled: false,
    morningBriefingEnabled: true,
  });

  assert.deepEqual(
    briefingOnly.scheduled.map(({ identifier }) => identifier),
    ['morning_briefing:2026-09-10'],
  );
  // A morning with more than one hour reads as a rounded range.
  assert.equal(
    briefingOnly.scheduled[0].body,
    'A cloudy morning between 11\u00b0C and 17\u00b0C. Your outfit for today is waiting in kuyara.',
  );
});

// The alert bodies already format their temperature for the active language; the briefing
// reads the same way, through the same locale pair, so the sign and the digits are the
// locale's rather than the template's.
test('the briefing formats its temperatures for the active language', async () => {
  const freezing = {
    ...weatherSnapshot(),
    hourly: [{
      forecastAt: '2026-09-10T07:00:00.000Z',
      temperatureCelsius: -4,
      apparentTemperatureCelsius: -6,
      condition: 'clear',
      precipitationProbability: 0,
      windSpeedMetersPerSecond: 2,
      humidity: 0.6,
      uvIndex: 0,
    }],
  };
  const turkish = createSchedulerHarness();

  await turkish.scheduler.reschedule({
    ...enabledInput,
    snapshot: freezing,
    weatherAlertsEnabled: false,
    morningBriefingEnabled: true,
    language: 'tr',
  });

  assert.equal(
    turkish.scheduled[0].body,
    'Açık bir sabah, -4\u00b0C. Bugünün kombini kuyara\u2019da seni bekliyor.',
  );
  assert.equal(turkish.scheduled[0].title, 'Günaydın');
});

test('a briefing range rounded to zero reads as one temperature', async () => {
  const morning = {
    ...weatherSnapshot(),
    hourly: [
      { ...weatherSnapshot().hourly[0], forecastAt: '2026-09-10T07:00:00.000Z', temperatureCelsius: -0.4, condition: 'cloudy', precipitationProbability: 0 },
      { ...weatherSnapshot().hourly[0], forecastAt: '2026-09-10T10:00:00.000Z', temperatureCelsius: 0.4, condition: 'cloudy', precipitationProbability: 0 },
    ],
  };
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({
    ...enabledInput,
    snapshot: morning,
    weatherAlertsEnabled: false,
    morningBriefingEnabled: true,
  });

  assert.equal(
    harness.scheduled[0].body,
    'A cloudy morning at 0\u00b0C. Your outfit for today is waiting in kuyara.',
  );
});

for (const [language, expectedBriefing, expectedAlert] of [
  ['en', 'A cloudy morning at 51°F. Your outfit for today is waiting in kuyara.',
    'Around 18:00, it will feel like 44°F. Take a warmer layer with you.'],
  ['tr', 'Bulutlu bir sabah, 51°F. Bugünün kombini kuyara\u2019da seni bekliyor.',
    'Saat 18:00 civarında hissedilen sıcaklık 44°F olacak. Yanına daha sıcak tutan bir kat al.'],
]) {
  test(`${language} notifications convert a Fahrenheit briefing and swing alert`, async () => {
    const morning = weatherSnapshot();
    // 10.49 and 10.51 round to 10 and 11 °C, but both display as 51 °F.
    const snapshot = {
      ...morning,
      hourly: [
        ...morning.hourly,
        { ...morning.hourly[0], forecastAt: '2026-09-10T07:00:00.000Z', temperatureCelsius: 10.49, condition: 'cloudy', precipitationProbability: 0 },
        { ...morning.hourly[0], forecastAt: '2026-09-10T10:00:00.000Z', temperatureCelsius: 10.51, condition: 'cloudy', precipitationProbability: 0 },
      ],
    };
    const harness = createSchedulerHarness();
    await harness.scheduler.reschedule({
      ...enabledInput,
      language,
      temperatureUnit: 'fahrenheit',
      snapshot,
      morningBriefingEnabled: true,
    });
    assert.equal(harness.scheduled.find(({ identifier }) => identifier.startsWith('morning_briefing'))?.body, expectedBriefing);
    assert.equal(harness.scheduled.find(({ identifier }) => identifier.startsWith('temperature_swing'))?.body, expectedAlert);
  });
}

test('a briefing the ledger already recorded for that day is not scheduled again', async () => {
  const harness = createSchedulerHarness({
    firedIds: new Set(['morning_briefing:2026-09-10']),
  });

  await harness.scheduler.reschedule({
    ...enabledInput,
    snapshot: {
      ...weatherSnapshot(),
      hourly: [{
        forecastAt: '2026-09-10T07:00:00.000Z',
        temperatureCelsius: 11,
        apparentTemperatureCelsius: 10,
        condition: 'cloudy',
        precipitationProbability: 0,
        windSpeedMetersPerSecond: 2,
        humidity: 0.6,
        uvIndex: 0,
      }],
    },
    weatherAlertsEnabled: false,
    morningBriefingEnabled: true,
  });

  assert.deepEqual(harness.scheduled, []);
  assert.deepEqual(harness.upserted[0], []);
});

test('rescheduling before 07:00 keeps this morning, after 07:00 plans tomorrow, and a fired morning stays suppressed', async () => {
  const morning = {
    ...weatherSnapshot(),
    hourly: [
      { ...weatherSnapshot().hourly[0], forecastAt: '2026-09-10T07:00:00.000Z' },
      { ...weatherSnapshot().hourly[0], forecastAt: '2026-09-11T07:00:00.000Z' },
    ],
  };
  for (const { now, firedIds, expected } of [
    { now: '2026-09-10T03:00:00.000Z', firedIds: new Set(), expected: 'morning_briefing:2026-09-10' },
    { now: '2026-09-10T07:00:00.000Z', firedIds: new Set(), expected: 'morning_briefing:2026-09-11' },
    { now: '2026-09-10T08:00:00.000Z', firedIds: new Set(), expected: 'morning_briefing:2026-09-11' },
    { now: '2026-09-10T03:00:00.000Z', firedIds: new Set(['morning_briefing:2026-09-10']), expected: 'morning_briefing:2026-09-11' },
  ]) {
    const harness = createSchedulerHarness({ now, firedIds });
    await harness.scheduler.reschedule({
      ...enabledInput,
      snapshot: { ...morning, fetchedAt: now },
      weatherAlertsEnabled: false,
      morningBriefingEnabled: true,
    });
    assert.deepEqual(harness.scheduled.map(({ identifier }) => identifier), [expected], now);
  }
});

test('weather alerts suppress identities whose ledger fire time has passed', async () => {
  const firedIds = new Set([
    'precipitation_onset:manual:sample.istanbul:2026-09-09:evening',
  ]);
  const harness = createSchedulerHarness({ firedIds });

  await harness.scheduler.reschedule(enabledInput);

  assert.deepEqual(
    harness.scheduled.map(({ identifier }) => identifier),
    ['temperature_swing:manual:sample.istanbul:2026-09-09:evening'],
  );
  assert.deepEqual(
    harness.upserted[0].map(({ id }) => id),
    ['temperature_swing:manual:sample.istanbul:2026-09-09:evening'],
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

// ADR 0032 copy is a localized sentence with the crossing interpolated into it, so only
// the time changes with the device clock: the 24-hour device reads 18:00 and the 12-hour
// device reads the same instant as 6:00 pm.
test('weather alert copy follows the device 12-hour clock setting', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({ ...enabledInput, hour12: true });

  assert.deepEqual(harness.scheduled.map(({ title, body }) => ({ title, body })), [
    {
      title: 'Rain is on the way',
      body: 'Rain is expected around 6:00 pm. Take something waterproof with you.',
    },
    {
      title: 'It will feel colder',
      body: 'Around 6:00 pm, it will feel like 6°C. Take a warmer layer with you.',
    },
  ]);
});

test('Turkish weather alert copy follows the device 12-hour clock setting', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({
    ...enabledInput,
    snapshot: { ...enabledInput.snapshot, timeZone: 'Europe/Istanbul' },
    language: 'tr',
    hour12: true,
  });

  assert.deepEqual(harness.scheduled.map(({ body }) => body), [
    'Saat ÖS 9:00 civarında yağmur bekleniyor. Yanına su geçirmez bir parça al.',
    'Saat ÖS 9:00 civarında hissedilen sıcaklık 6°C olacak. Yanına daha sıcak tutan bir kat al.',
  ]);
});

test('disabled weather alerts cancel and delete pending ledger rows without reading or upserting', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({ ...enabledInput, weatherAlertsEnabled: false });

  assert.deepEqual(harness.events, ['cancel', 'delete-pending']);
});

test('a missing weather snapshot cancels only the disabled kind', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({ ...enabledInput, snapshot: null });

  assert.deepEqual(harness.events, ['cancel:morning_briefing', 'delete-pending:morning_briefing']);
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

  const first = harness.scheduler.reschedule({ ...enabledInput, weatherAlertsEnabled: false });
  const second = harness.scheduler.reschedule({
    ...enabledInput,
    weatherAlertsEnabled: false,
    morningBriefingEnabled: false,
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
    morningBriefingEnabled: true,
    snapshot: { ...enabledInput.snapshot, fetchedAt: '2026-09-09T14:00:00.000Z' },
  });

  assert.deepEqual(harness.events, []);
});

test('opting out still cancels and clears pending rows from a stale snapshot', async () => {
  const harness = createSchedulerHarness();

  await harness.scheduler.reschedule({
    ...enabledInput,
    weatherAlertsEnabled: false,
    morningBriefingEnabled: false,
    snapshot: { ...enabledInput.snapshot, fetchedAt: '2026-09-09T14:00:00.000Z' },
  });

  assert.deepEqual(harness.events, ['cancel', 'delete-pending']);
});

for (const [name, weatherAlertsEnabled, morningBriefingEnabled, kind] of [
  ['weather alerts', false, true, 'weather_alert'],
  ['morning briefing', true, false, 'morning_briefing'],
]) test(`turning off ${name} cancels only that kind with stale weather`, async () => {
  const harness = createSchedulerHarness();
  await harness.scheduler.reschedule({
    ...enabledInput,
    weatherAlertsEnabled,
    morningBriefingEnabled,
    snapshot: { ...enabledInput.snapshot, fetchedAt: '2026-09-09T14:00:00.000Z' },
  });
  assert.deepEqual(harness.events, [`cancel:${kind}`, `delete-pending:${kind}`]);
});

test('toggle, freshness and pending-kind matrix preserves only allowed stale schedules', async () => {
  for (const kind of ['weather_alert', 'morning_briefing']) {
    for (const toggle of ['on-to-off', 'off-to-on']) {
      for (const freshness of ['fresh', 'stale']) {
        for (const pendingState of ['none', 'that-kind', 'both-kinds']) {
          const target = kind === 'weather_alert' ? 'precipitation_onset:place:day'
            : 'morning_briefing:day';
          const other = kind === 'weather_alert' ? 'morning_briefing:day'
            : 'precipitation_onset:place:day';
          const initialPending = pendingState === 'none' ? []
            : pendingState === 'that-kind' ? [target] : [target, other];
          const pending = new Set(initialPending);
          const cancelled = [];
          const scheduler = new WeatherAlertScheduler({
            cancelScheduledWeatherAlerts: async (selectedKind) => {
              cancelled.push(selectedKind ?? 'all');
              for (const id of pending) {
                if (!selectedKind || (id.startsWith('morning_briefing:')
                  ? 'morning_briefing' : 'weather_alert') === selectedKind) pending.delete(id);
              }
              return true;
            },
            scheduleWeatherAlert: async () => false,
          }, {
            deletePending: async () => undefined,
            listFiredIds: async () => new Set(),
            upsertScheduled: async () => undefined,
            pruneBefore: async () => undefined,
          }, () => '2026-09-09T15:00:00.000Z');
          const enabled = toggle === 'off-to-on';
          await scheduler.reschedule({
            ...enabledInput,
            snapshot: { ...enabledInput.snapshot,
              fetchedAt: freshness === 'fresh'
                ? '2026-09-09T15:00:00.000Z' : '2026-09-09T14:00:00.000Z' },
            weatherAlertsEnabled: kind === 'weather_alert' ? enabled : true,
            morningBriefingEnabled: kind === 'morning_briefing' ? enabled : true,
          });
          const label = `${kind}, ${toggle}, ${freshness}, ${pendingState}`;
          assert.deepEqual(cancelled, freshness === 'fresh' ? ['all']
            : enabled ? [] : [kind], label);
          const expectedPending = freshness === 'fresh' ? []
            : enabled ? initialPending : initialPending.filter((id) => id !== target);
          assert.deepEqual([...pending].sort(), expectedPending.sort(), label);
        }
      }
    }
  }
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
    ['precipitation_onset:manual:sample.istanbul:2026-09-09:evening'],
  );
});

test('an opt-out queued behind a failing run still runs, and the caller still sees the failure', async () => {
  const cancelled = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let failed = false;
  const scheduler = new WeatherAlertScheduler({
    cancelScheduledWeatherAlerts: async (kind) => {
      cancelled.push(kind ?? 'all');
      await gate;
      return true;
    },
    scheduleWeatherAlert: async () => true,
  }, {
    deletePending: async () => {
      if (!failed) {
        failed = true;
        throw new Error('sqlite busy');
      }
    },
    listFiredIds: async () => new Set(),
    upsertScheduled: async () => undefined,
    pruneBefore: async () => undefined,
  }, () => '2026-09-09T15:00:00.000Z');

  const first = scheduler.reschedule(enabledInput);
  const optOut = scheduler.reschedule({
    ...enabledInput, weatherAlertsEnabled: false, morningBriefingEnabled: false,
  });
  const settled = Promise.allSettled([first, optOut]);
  release();
  const results = await settled;

  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'rejected');
  assert.deepEqual(cancelled, ['all', 'all']);
});
