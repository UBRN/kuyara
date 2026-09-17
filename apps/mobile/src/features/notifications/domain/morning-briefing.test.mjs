import assert from 'node:assert/strict';
import test from 'node:test';

import {
  morningBriefingId,
  morningBriefingLocalHour,
  planMorningBriefing,
} from './morning-briefing.ts';
import { messages } from '../../../localization/messages.ts';
import { defaultQuietHours } from './weather-alerts.ts';

const now = '2026-09-09T15:00:00.000Z';

function measurements(overrides = {}) {
  return {
    temperatureCelsius: 14,
    apparentTemperatureCelsius: 14,
    condition: 'cloudy',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 1,
    humidity: 0.5,
    uvIndex: 0,
    ...overrides,
  };
}

function hour(forecastAt, overrides = {}) {
  return { forecastAt, ...measurements(overrides) };
}

// A morning that starts at 12 °C, is clear at 07:00 and warms to 18 °C by 11:00.
const tomorrowMorning = [
  hour('2026-09-10T07:00:00.000Z', { temperatureCelsius: 12, condition: 'clear' }),
  hour('2026-09-10T08:00:00.000Z', { temperatureCelsius: 15 }),
  hour('2026-09-10T11:00:00.000Z', { temperatureCelsius: 18 }),
];

function snapshot(overrides = {}) {
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    localProfileId: 'profile-one',
    locationKey: 'manual:sample.istanbul',
    timeZone: 'UTC',
    fetchedAt: now,
    current: { observedAt: now, ...measurements() },
    origin: { kind: 'sample', sourceId: 'briefing-test' },
    minimumTemperatureCelsius: 12,
    maximumTemperatureCelsius: 20,
    hourly: tomorrowMorning,
    ...overrides,
  };
}

function plan(overrides = {}) {
  return planMorningBriefing({
    snapshot: snapshot(),
    now,
    deliveredIds: new Set(),
    ...overrides,
  });
}

test('tomorrow morning is projected from its own hours, at the hour it is read', () => {
  assert.deepEqual(plan(), {
    id: 'morning_briefing:2026-09-10',
    localDate: '2026-09-10',
    fireAt: '2026-09-10T07:00:00.000Z',
    content: {
      minimumTemperatureCelsius: 12,
      maximumTemperatureCelsius: 18,
      condition: 'clear',
      precipitationLikely: false,
    },
  });
});

test('the briefing fires as quiet hours end, so it never falls inside them', () => {
  assert.equal(morningBriefingLocalHour, defaultQuietHours.end.hour);
  assert.equal(defaultQuietHours.end.minute, 0);
});

test('the fire time is the morning hour in the snapshot’s time zone, not in UTC', () => {
  const istanbul = plan({
    snapshot: snapshot({
      timeZone: 'Europe/Istanbul',
      // 07:00 and 11:00 in Istanbul are 04:00 and 08:00 UTC.
      hourly: [
        hour('2026-09-10T04:00:00.000Z', { temperatureCelsius: 12, condition: 'fog' }),
        hour('2026-09-10T08:00:00.000Z', { temperatureCelsius: 19 }),
      ],
    }),
  });

  assert.equal(istanbul.fireAt, '2026-09-10T04:00:00.000Z');
  assert.equal(istanbul.content.condition, 'fog');
  assert.equal(istanbul.content.maximumTemperatureCelsius, 19);
});

test('hours outside the morning window are not part of the range', () => {
  const withEvening = plan({
    snapshot: snapshot({
      hourly: [
        hour('2026-09-10T06:00:00.000Z', { temperatureCelsius: 4 }),
        ...tomorrowMorning,
        hour('2026-09-10T18:00:00.000Z', { temperatureCelsius: 27 }),
      ],
    }),
  });

  assert.equal(withEvening.content.minimumTemperatureCelsius, 12);
  assert.equal(withEvening.content.maximumTemperatureCelsius, 18);
});

test('precipitation anywhere in the morning is reported, by probability or by condition', () => {
  const byProbability = plan({
    snapshot: snapshot({
      hourly: [
        tomorrowMorning[0],
        hour('2026-09-10T09:00:00.000Z', { precipitationProbability: 0.6 }),
      ],
    }),
  });
  const byCondition = plan({
    snapshot: snapshot({
      hourly: [
        tomorrowMorning[0],
        hour('2026-09-10T09:00:00.000Z', { condition: 'snow' }),
      ],
    }),
  });
  const dry = plan({
    snapshot: snapshot({
      hourly: [
        tomorrowMorning[0],
        hour('2026-09-10T09:00:00.000Z', { precipitationProbability: 0.59 }),
      ],
    }),
  });

  assert.equal(byProbability.content.precipitationLikely, true);
  assert.equal(byCondition.content.precipitationLikely, true);
  assert.equal(dry.content.precipitationLikely, false);
});

test('a window that does not reach tomorrow’s morning hour plans nothing at all', () => {
  // The hourly window is bounded, so a late-evening snapshot can stop short of 07:00.
  assert.equal(plan({ snapshot: snapshot({ hourly: [hour('2026-09-09T22:00:00.000Z')] }) }), null);
  assert.equal(plan({
    snapshot: snapshot({ hourly: [hour('2026-09-10T08:00:00.000Z')] }),
  }), null);
  assert.equal(plan({ snapshot: snapshot({ hourly: [] }) }), null);
});

test('a briefing already delivered for that day is not planned again', () => {
  assert.equal(
    plan({ deliveredIds: new Set([morningBriefingId('2026-09-10')]) }),
    null,
  );
});

test('a clock past the window\u2019s last day leaves no morning to plan', () => {
  // The hours above belong to 2026-09-10, so from that day onward the day after it has
  // none and there is nothing to project.
  assert.equal(plan({ now: '2026-09-10T07:30:00.000Z' }), null);
});

test('the briefing copy names the hour the briefing is planned for', () => {
  // The two sentences that promise a time are the only copy the hour reaches, and nothing
  // else ties them to it: a moved quiet-hours end would leave them promising 07:00 while
  // the notification arrived at another hour.
  const stampedHour = String(morningBriefingLocalHour).padStart(2, '0');

  for (const [language, separator] of Object.entries({ en: ':', tr: '.' })) {
    const { morningBriefing, offer } = messages[language].notifications;
    const stamp = `${stampedHour}${separator}00`;

    assert.ok(
      offer.sentences.morning_briefing.includes(stamp),
      `${language} offer sentence does not name ${stamp}`,
    );
    assert.ok(
      morningBriefing.hint.includes(stamp),
      `${language} briefing hint does not name ${stamp}`,
    );
  }
});
