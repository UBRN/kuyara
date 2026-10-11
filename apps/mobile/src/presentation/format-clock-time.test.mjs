import assert from 'node:assert/strict';
import test from 'node:test';

import { getDeviceTimeZone } from '../domain/intl-format.ts';
import { formatClockTime, formatLastUpdated, formatNaturalClockTime, formatSpokenClockTime, formatWallClockTime } from './format-clock-time.ts';

// The test loader pins the device zone to UTC unless TZ names another; the assertions below
// hold in any zone, and the ones that spell a time out are kept to the pinned zone.
const deviceZone = getDeviceTimeZone();

test('a fixed wall-clock time follows the device 12 or 24-hour setting, in both languages', () => {
  const quietStart = { hour: 22, minute: 0 };
  const quietEnd = { hour: 7, minute: 0 };

  assert.equal(formatWallClockTime(quietStart, 'en', false), '22:00');
  assert.equal(formatWallClockTime(quietEnd, 'en', false), '07:00');
  assert.equal(formatWallClockTime(quietStart, 'en', true), '10:00 pm');
  assert.equal(formatWallClockTime(quietEnd, 'en', true), '7:00 am');
  assert.equal(formatWallClockTime(quietStart, 'tr', false), '22:00');
  assert.equal(formatWallClockTime(quietEnd, 'tr', false), '07:00');
  // Turkish puts its own day-period marker before the digits on a 12-hour clock.
  assert.equal(formatWallClockTime(quietStart, 'tr', true), 'ÖS 10:00');
});

test('a clock time follows the language, the 12 or 24-hour setting and the zone it is read in', () => {
  const instant = '2026-10-04T16:05:00.000Z';

  assert.equal(formatClockTime(instant, 'en', false, 'Europe/Istanbul'), '19:05');
  assert.equal(formatClockTime(instant, 'en', true, 'Europe/Istanbul'), '7:05 pm');
  assert.equal(formatClockTime(instant, 'tr', false, 'Europe/Istanbul'), '19:05');
  assert.equal(formatClockTime(instant, 'tr', true, 'Europe/Istanbul'), 'ÖS 7:05');
  assert.equal(formatClockTime(instant, 'en', true, 'Asia/Kolkata'), '9:35 pm');
  assert.equal(formatClockTime(instant, 'en', false, 'America/New_York'), '12:05');
  assert.equal(formatClockTime(Date.parse(instant), 'en', false, 'UTC'), '16:05');
});

test('a clock time without a zone is read in the device zone', () => {
  const instant = '2026-10-04T16:05:00.000Z';

  // Whatever zone the process runs in, the zoneless reading is that zone's.
  assert.equal(formatClockTime(instant, 'en', false), formatClockTime(instant, 'en', false, deviceZone));
  assert.equal(formatClockTime(instant, 'tr', true), formatClockTime(instant, 'tr', true, deviceZone));
  if (deviceZone === 'UTC') {
    assert.equal(formatClockTime(instant, 'en', false), '16:05');
    assert.equal(formatClockTime(instant, 'tr', true), 'ÖS 4:05');
  }
});

test('last updated is the time on the current local day and the short date and time otherwise', () => {
  // A quarter of an hour that no zone's midnight falls into, so `today` and `now` share a
  // local day everywhere; two days earlier is another local day everywhere.
  const now = Date.parse('2026-10-04T13:20:00Z');
  const today = '2026-10-04T13:05:00.000Z';
  const earlier = '2026-10-02T13:05:00.000Z';

  assert.equal(formatLastUpdated(today, 'en', false, now), formatClockTime(today, 'en', false, deviceZone));
  assert.equal(formatLastUpdated(today, 'en', true, now), formatClockTime(today, 'en', true, deviceZone));
  assert.equal(formatLastUpdated(today, 'tr', true, now), formatNaturalClockTime(today, 'tr', true, deviceZone));
  for (const [language, hour12] of [['en', false], ['en', true], ['tr', false]]) {
    const dated = formatLastUpdated(earlier, language, hour12, now);
    assert.notEqual(dated, formatClockTime(earlier, language, hour12, deviceZone));
    assert.ok(dated.includes('2026'), dated);
    // The comma and the clock's own form, so a padded hour cannot hide behind endsWith.
    const clock = formatClockTime(earlier, language, hour12, deviceZone);
    assert.ok(language === 'en' ? dated.endsWith(`, ${clock}`) : dated.endsWith(clock), dated);
  }
  if (deviceZone === 'UTC') {
    assert.equal(formatLastUpdated(today, 'en', false, now), '13:05');
    assert.equal(formatLastUpdated(today, 'en', true, now), '1:05 pm');
    assert.equal(formatLastUpdated(today, 'tr', true, now), 'öğleden sonra 1:05');
    assert.equal(formatLastUpdated(earlier, 'en', false, now), '02/10/2026, 13:05');
    assert.equal(formatLastUpdated(earlier, 'en', true, now), '02/10/2026, 1:05 pm');
    assert.equal(formatLastUpdated(earlier, 'tr', false, now), '2.10.2026 13:05');
  }
});

// A notification sentence says its time the way it is spoken. English keeps the clock's own
// form. Turkish keeps the 24-hour form and, on a 12-hour clock, names the part of the day
// ("akşam saat 7:05") instead of printing the abbreviation ("ÖS 7:05").
test('a spoken clock time names the Turkish part of the day on a 12-hour clock', () => {
  const at = (hour, minute = 0) => new Date(Date.UTC(2026, 9, 4, hour, minute)).toISOString();
  const spoken = (hour, minute, hour12 = true) => formatSpokenClockTime(at(hour, minute), 'tr', hour12, 'UTC');

  assert.equal(spoken(0, 5), 'gece saat 12:05');
  assert.equal(spoken(5, 0), 'gece saat 5:00');
  assert.equal(spoken(6, 0), 'sabah saat 6:00');
  assert.equal(spoken(11, 30), 'sabah saat 11:30');
  assert.equal(spoken(12, 0), 'öğle saat 12:00');
  assert.equal(spoken(13, 15), 'öğleden sonra saat 1:15');
  assert.equal(spoken(17, 0), 'öğleden sonra saat 5:00');
  assert.equal(spoken(18, 0), 'akşam saat 6:00');
  assert.equal(spoken(21, 45), 'akşam saat 9:45');
  assert.equal(spoken(22, 0), 'gece saat 10:00');
  assert.equal(spoken(17, 0, false), 'saat 17:00');
  assert.equal(formatNaturalClockTime(at(17, 5), 'tr', true, 'UTC'), 'öğleden sonra 5:05');
  assert.equal(formatNaturalClockTime(at(17, 5), 'tr', false, 'UTC'), '17:05');
});

test('English spoken and natural clock times are the clock time itself', () => {
  const instant = '2026-10-04T16:05:00.000Z';

  for (const hour12 of [false, true]) {
    assert.equal(formatSpokenClockTime(instant, 'en', hour12, 'UTC'), formatClockTime(instant, 'en', hour12, 'UTC'));
    assert.equal(formatNaturalClockTime(instant, 'en', hour12, 'UTC'), formatClockTime(instant, 'en', hour12, 'UTC'));
  }
});
