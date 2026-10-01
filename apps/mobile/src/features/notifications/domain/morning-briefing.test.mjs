import assert from 'node:assert/strict';
import test from 'node:test';

import {
  morningBriefingId,
  morningBriefingLocalHour,
  planMorningBriefing,
} from './morning-briefing.ts';
import { messages } from '../../../localization/messages.ts';
import { temperatureSwingCelsius } from '../../weather/domain/weather-thresholds.ts';
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

// A forecast that starts at 12 °C at 07:00 and warms to 18 °C by 11:00.
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

test('tomorrow is projected from the briefing hour through the last covered hour', () => {
  assert.deepEqual(plan(), {
    id: 'morning_briefing:2026-09-10',
    localDate: '2026-09-10',
    fireAt: '2026-09-10T07:00:00.000Z',
    content: {
      minimumTemperatureCelsius: 12,
      maximumTemperatureCelsius: 18,
      condition: 'clear',
      precipitationLikely: false,
      coveredThrough: '2026-09-10T11:00:00.000Z',
      event: null,
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

test('hours before the briefing are excluded and covered evening hours join the range', () => {
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
  assert.equal(withEvening.content.maximumTemperatureCelsius, 27);
  assert.equal(withEvening.content.coveredThrough, '2026-09-10T18:00:00.000Z');
});

test('rain at 19:00 is the one remaining decision-changing event', () => {
  const rainy = plan({ snapshot: snapshot({ hourly: [
    tomorrowMorning[0],
    hour('2026-09-10T15:00:00.000Z', { temperatureCelsius: 22 }),
    hour('2026-09-10T19:00:00.000Z', { condition: 'rain', temperatureCelsius: 17 }),
    hour('2026-09-10T23:00:00.000Z', { condition: 'rain', temperatureCelsius: 14 }),
  ] }) });
  assert.equal(rainy.content.minimumTemperatureCelsius, 12);
  assert.equal(rainy.content.maximumTemperatureCelsius, 22);
  assert.equal(rainy.content.coveredThrough, null);
  assert.deepEqual(rainy.content.event, {
    kind: 'precipitation_onset', form: 'rain', atHour: '2026-09-10T19:00:00.000Z',
  });
});

test('a dry day covered through 23:00 has no event', () => {
  const dry = plan({ snapshot: snapshot({ hourly: [
    tomorrowMorning[0],
    hour('2026-09-10T15:00:00.000Z', { temperatureCelsius: 18 }),
    hour('2026-09-10T23:00:00.000Z', { temperatureCelsius: 16 }),
  ] }) });
  assert.equal(dry.content.coveredThrough, null);
  assert.equal(dry.content.event, null);
});

test('a snapshot ending at 15:00 describes covered hours only and marks partial coverage', () => {
  const short = plan({ snapshot: snapshot({ hourly: [
    tomorrowMorning[0],
    hour('2026-09-10T15:00:00.000Z', { temperatureCelsius: 20 }),
  ] }) });
  assert.equal(short.content.maximumTemperatureCelsius, 20);
  assert.equal(short.content.coveredThrough, '2026-09-10T15:00:00.000Z');
  assert.equal(short.content.event, null);
});

test('a temperature swing uses the Weather outlook threshold and event shape', () => {
  const swing = plan({ snapshot: snapshot({ hourly: [
    tomorrowMorning[0],
    hour('2026-09-10T13:00:00.000Z', { apparentTemperatureCelsius: 14 + temperatureSwingCelsius }),
    hour('2026-09-10T23:00:00.000Z', { apparentTemperatureCelsius: 14 + temperatureSwingCelsius }),
  ] }) });
  assert.deepEqual(swing.content.event, {
    kind: 'temperature_change', direction: 'rise', atHour: '2026-09-10T13:00:00.000Z',
    fromApparentCelsius: 14, toApparentCelsius: 14 + temperatureSwingCelsius,
  });
});

test('precipitation crossing follows the Weather outlook wetness threshold', () => {
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

  assert.equal(byProbability.content.event?.kind, 'precipitation_onset');
  assert.equal(byCondition.content.event?.kind, 'precipitation_onset');
  assert.equal(dry.content.event, null);
});

test('a wet briefing hour is flagged by the Weather outlook wetness threshold, hours after it are not', () => {
  const wetStart = plan({ snapshot: snapshot({ hourly: [
    hour('2026-09-10T07:00:00.000Z', { precipitationProbability: 0.6 }),
    hour('2026-09-10T09:00:00.000Z', { precipitationProbability: 0 }),
  ] }) });
  const dryStart = plan({ snapshot: snapshot({ hourly: [
    tomorrowMorning[0],
    hour('2026-09-10T09:00:00.000Z', { precipitationProbability: 0.9 }),
  ] }) });

  assert.equal(wetStart.content.precipitationLikely, true);
  assert.equal(dryStart.content.precipitationLikely, false);
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

test('the briefing copy names the time it is given, and the screens give it the planned hour', () => {
  // The two sentences that promise a time take it from the caller, so it is written on the
  // device's own clock; the screens that show them format morningBriefingLocalHour (the
  // hour quiet hours end, which is when the briefing fires), so a moved end moves the copy.
  const stamp = `${String(morningBriefingLocalHour).padStart(2, '0')}:00`;

  for (const language of ['en', 'tr']) {
    const { morningBriefing, offer } = messages[language].notifications;

    assert.ok(
      offer.morningBriefingSentence(stamp).includes(stamp),
      `${language} offer sentence does not carry the time it is given`,
    );
    assert.ok(
      morningBriefing.hint(stamp).includes(stamp),
      `${language} briefing hint does not carry the time it is given`,
    );
  }
});
