import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

import { dateTimeFormat, isValidTimeZone, numberFormat, zonedClock, zonedHour } from './intl-format.ts';

test('a zoned date formatter is built once per locale and options', () => {
  const options = { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' };
  const first = dateTimeFormat('en', options);
  assert.equal(dateTimeFormat('en', { ...options }), first);
  assert.notEqual(dateTimeFormat('tr-TR', options), first);
  assert.notEqual(dateTimeFormat('en', { ...options, timeZone: 'UTC' }), first);
  assert.equal(first.format(Date.UTC(2026, 0, 1, 9)), '12');
});

test('a date formatter without a zone is built fresh, so it reads the current device zone', () => {
  const options = { hour: '2-digit', minute: '2-digit' };
  assert.notEqual(dateTimeFormat('en', options), dateTimeFormat('en', options));
});

test('an invalid zone throws every time and is never kept', () => {
  assert.throws(() => dateTimeFormat('en', { timeZone: 'Not/AZone' }), RangeError);
  assert.throws(() => dateTimeFormat('en', { timeZone: 'Not/AZone' }), RangeError);
});

test('a number formatter is built once per locale and options', () => {
  const first = numberFormat('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  assert.equal(numberFormat('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 }), first);
  assert.notEqual(numberFormat('tr-TR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }), first);
  assert.equal(first.format(12.34), '12.3');
});

test('a zone\'s hour reads 0-23 across a spring-forward night', () => {
  // New York, 8 March 2026: 02:00 jumps to 03:00 and 02:xx never appears.
  const zone = 'America/New_York';
  assert.equal(zonedHour(Date.UTC(2026, 2, 8, 6, 59, 59), zone), 1);
  assert.equal(zonedHour(Date.UTC(2026, 2, 8, 7, 0, 0), zone), 3);
  const hours = [];
  for (let at = Date.UTC(2026, 2, 8, 5); at < Date.UTC(2026, 2, 8, 9); at += 3600000) {
    hours.push(zonedHour(at, zone));
  }
  assert.deepEqual(hours, [0, 1, 3, 4]);
});

test('a zone\'s hour repeats across a fall-back night and midnight is 0, never 24', () => {
  // New York, 1 November 2026: 01:00-01:59 happens twice.
  const zone = 'America/New_York';
  assert.equal(zonedHour(Date.UTC(2026, 10, 1, 5, 30), zone), 1);
  assert.equal(zonedHour(Date.UTC(2026, 10, 1, 6, 30), zone), 1);
  assert.equal(zonedHour(Date.UTC(2026, 10, 1, 7, 30), zone), 2);
  assert.equal(zonedHour(Date.UTC(2026, 2, 1, 5, 0), zone), 0);
  assert.equal(zonedHour(Date.UTC(2026, 2, 1, 4, 59, 59), zone), 23);
});

test('the zoned wall clock carries the date and time as the zone shows them', () => {
  assert.deepEqual(zonedClock(Date.UTC(2026, 11, 31, 22, 15, 30), 'Europe/Istanbul'), {
    year: 2027, month: 1, day: 1, hour: 1, minute: 15, second: 30,
  });
  assert.throws(() => zonedClock(0, 'Not/AZone'), RangeError);
});

test('a time zone is valid when Intl names it', () => {
  for (const zone of ['UTC', 'CET', 'Europe/Istanbul', 'America/New_York']) {
    assert.equal(isValidTimeZone(zone), true, zone);
  }
  for (const zone of ['', 'Not/AZone', 'Europe/Nowhere']) {
    assert.equal(isValidTimeZone(zone), false, zone);
  }
});

// Shrink-only: these files still build a formatter per call, each for a device-zone clock,
// a rare path or a one-off value. A new render path goes through intl-format.ts instead.
const allowedConstructions = new Map([
  ['domain/intl-format.ts', 3],
  ['features/notifications/application/weather-alert-scheduler.ts', 1],
  ['features/profile/presentation/history-screen.tsx', 1],
  ['features/profile/presentation/service-providers-screen.tsx', 1],
  ['features/profile/presentation/settings-screen.tsx', 1],
  ['features/today/presentation/today-presentation.ts', 3],
  ['features/weather/presentation/weather-screen.tsx', 1],
  ['localization/device-locale.ts', 1],
  ['presentation/format-clock-time.ts', 1],
]);

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

test('formatter construction outside intl-format.ts only shrinks', () => {
  const root = new URL('..', import.meta.url).pathname;
  const found = new Map();
  for (const path of sourceFiles(root)) {
    const count = readFileSync(path, 'utf8').match(/new Intl\.(?:DateTimeFormat|NumberFormat)\(/gu)?.length ?? 0;
    if (count > 0) found.set(relative(root, path), count);
  }
  for (const [file, count] of found) {
    assert.ok(count <= (allowedConstructions.get(file) ?? 0), `${file} builds ${count} formatters per call`);
  }
});
