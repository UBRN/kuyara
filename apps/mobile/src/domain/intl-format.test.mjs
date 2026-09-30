import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

import { dateTimeFormat, numberFormat } from './intl-format.ts';

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

// Shrink-only: these files still build a formatter per call, each for a device-zone clock,
// a rare path or a one-off value. A new render path goes through intl-format.ts instead.
const allowedConstructions = new Map([
  ['domain/intl-format.ts', 3],
  ['features/notifications/application/weather-alert-scheduler.ts', 1],
  ['features/notifications/domain/morning-briefing.ts', 1],
  ['features/notifications/domain/weather-alerts.ts', 1],
  ['features/profile/presentation/history-screen.tsx', 1],
  ['features/profile/presentation/service-providers-screen.tsx', 1],
  ['features/profile/presentation/settings-screen.tsx', 1],
  ['features/recommendation/domain/dressing-day-departure.ts', 1],
  ['features/today/presentation/today-presentation.ts', 3],
  ['features/weather/domain/weather.ts', 1],
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
