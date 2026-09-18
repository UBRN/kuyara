import assert from 'node:assert/strict';
import test from 'node:test';

import { solarEventsOf } from './solar-day.ts';

const MINUTE_MS = 60_000;
const TOLERANCE_MS = 4 * MINUTE_MS;

/**
 * Published sunrise and sunset times, written here as the instant they name so the test
 * does not depend on the machine's own zone. The local wall clock each one stands for is
 * in the comment beside it. Four minutes of tolerance is well inside what an almanac and a
 * point coordinate disagree about, and far inside what a glyph can express.
 */
const almanac = [
  {
    place: 'Istanbul', latitude: 41.01, longitude: 28.98,
    // 18 September 2026, 06:48 and 19:08 local (UTC+3 all year).
    sunrise: '2026-09-18T03:48:00Z', sunset: '2026-09-18T16:08:00Z',
  },
  {
    place: 'Istanbul at the December solstice', latitude: 41.01, longitude: 28.98,
    // 21 December 2026, 08:26 and 17:39 local.
    sunrise: '2026-12-21T05:26:00Z', sunset: '2026-12-21T14:39:00Z',
  },
  {
    place: 'Reykjavik near the polar day', latitude: 64.15, longitude: -21.94,
    // 21 June 2026, 02:55 local, setting after midnight on the 22nd (UTC all year).
    sunrise: '2026-06-21T02:55:00Z', sunset: '2026-06-22T00:04:00Z',
  },
  {
    place: 'Reykjavik on its shortest day', latitude: 64.15, longitude: -21.94,
    // 21 December 2026, 11:22 and 15:30 local: four hours of daylight.
    sunrise: '2026-12-21T11:22:00Z', sunset: '2026-12-21T15:30:00Z',
  },
  {
    place: 'Nairobi at the March equinox', latitude: -1.29, longitude: 36.82,
    // 20 March 2026, 06:36 and 18:43 local (UTC+3).
    sunrise: '2026-03-20T03:36:00Z', sunset: '2026-03-20T15:43:00Z',
  },
  {
    place: 'Nairobi in September', latitude: -1.29, longitude: 36.82,
    // 18 September 2026, 06:23 and 18:30 local: the same day length six months apart.
    sunrise: '2026-09-18T03:23:00Z', sunset: '2026-09-18T15:30:00Z',
  },
  {
    place: 'Sydney at its winter solstice', latitude: -33.87, longitude: 151.21,
    // 21 June 2026, 07:00 and 16:54 local (UTC+10): the southern hemisphere's short day.
    sunrise: '2026-06-20T21:00:00Z', sunset: '2026-06-21T06:54:00Z',
  },
  {
    place: 'Sydney at its summer solstice', latitude: -33.87, longitude: 151.21,
    // 21 December 2026, 05:41 and 20:05 local (UTC+11 in daylight saving).
    sunrise: '2026-12-20T18:41:00Z', sunset: '2026-12-21T09:05:00Z',
  },
];

test('sunrise and sunset match the published times within four minutes', () => {
  for (const { place, latitude, longitude, sunrise, sunset } of almanac) {
    const expectedSunrise = Date.parse(sunrise);
    const expectedSunset = Date.parse(sunset);
    // Ask about the middle of the published daylight, which is the case a glyph asks about.
    const events = solarEventsOf(
      latitude,
      longitude,
      (expectedSunrise + expectedSunset) / 2,
    );

    assert.ok(events, `${place} resolved no sunrise`);
    const sunriseDrift = (events.sunriseMs - expectedSunrise) / MINUTE_MS;
    const sunsetDrift = (events.sunsetMs - expectedSunset) / MINUTE_MS;
    assert.ok(
      Math.abs(events.sunriseMs - expectedSunrise) <= TOLERANCE_MS,
      `${place} sunrise drifted ${sunriseDrift.toFixed(1)} minutes`,
    );
    assert.ok(
      Math.abs(events.sunsetMs - expectedSunset) <= TOLERANCE_MS,
      `${place} sunset drifted ${sunsetDrift.toFixed(1)} minutes`,
    );
  }
});

test('the pair always belongs to the solar day that contains the instant', () => {
  // Every hour of a day at four longitudes, including two where the civil date and the
  // solar date are a day apart, which is where a naive UTC-date calculation slips.
  const longitudes = [[41.01, 28.98], [-33.87, 151.21], [64.15, -21.94], [-17.75, -177.5]];
  // Half a solar day, plus the widest the equation of time ever pushes solar noon.
  const HALF_DAY_MS = 12 * 3_600_000 + 20 * MINUTE_MS;

  for (const [latitude, longitude] of longitudes) {
    for (let hour = 0; hour < 24; hour += 1) {
      const instantMs = Date.parse('2026-09-18T00:00:00Z') + hour * 3_600_000;
      const events = solarEventsOf(latitude, longitude, instantMs);

      assert.ok(events, `no events at longitude ${longitude} hour ${hour}`);
      assert.ok(events.sunsetMs > events.sunriseMs, 'sunset must follow sunrise');
      const solarNoonMs = (events.sunriseMs + events.sunsetMs) / 2;
      assert.ok(
        Math.abs(solarNoonMs - instantMs) <= HALF_DAY_MS,
        `longitude ${longitude} hour ${hour} answered a neighbouring solar day`,
      );
    }
  }
});

test('a polar day and a polar night are told apart rather than sharing one answer', () => {
  const longyearbyen = [78.22, 15.65];

  assert.equal(solarEventsOf(...longyearbyen, Date.parse('2026-12-21T12:00:00Z')), 'polar_night');
  assert.equal(solarEventsOf(...longyearbyen, Date.parse('2026-06-21T12:00:00Z')), 'polar_day');
  // The same place in September still has a sunrise, so the polar answers are the sun's
  // doing and not the latitude's.
  assert.ok(solarEventsOf(...longyearbyen, Date.parse('2026-09-18T12:00:00Z')));
});

test('unusable inputs resolve to no crossing rather than to a fabricated one', () => {
  for (const [latitude, longitude, instantMs] of [
    [Number.NaN, 28.98, 0],
    [41.01, Number.NaN, 0],
    [41.01, 28.98, Number.NaN],
    [41.01, 28.98, Number.POSITIVE_INFINITY],
    [91, 28.98, 0],
    [-91, 28.98, 0],
    [41.01, 181, 0],
    [41.01, -181, 0],
  ]) {
    assert.equal(solarEventsOf(latitude, longitude, instantMs), null);
  }
});
