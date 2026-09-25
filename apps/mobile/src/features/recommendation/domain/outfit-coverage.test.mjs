import assert from 'node:assert/strict';
import test from 'node:test';

import { nextBareDressingDayKey } from './dressing-day-choice.ts';
import { outfitCoverage } from './outfit-coverage.ts';

test('coverage end follows departure hour across the full dressing day', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const start = `2026-09-25T${String(hour).padStart(2, '0')}:00:00.000Z`;
    const expected = hour < 1 ? '2026-09-25T01:00:00.000Z'
      : hour < 4 ? '2026-09-25T04:00:00.000Z'
        : hour < 11 ? '2026-09-25T19:00:00.000Z'
          : hour < 16 ? '2026-09-25T20:00:00.000Z'
            : hour < 18 ? '2026-09-25T22:00:00.000Z'
              : '2026-09-26T01:00:00.000Z';
    assert.deepEqual(outfitCoverage(start, 'UTC'), { start, end: expected }, start);
  }
  for (const [clock, expected] of [
    ['00:59', '2026-09-25T01:00:00.000Z'],
    ['01:00', '2026-09-25T04:00:00.000Z'],
    ['10:59', '2026-09-25T19:00:00.000Z'],
    ['11:00', '2026-09-25T20:00:00.000Z'],
    ['15:59', '2026-09-25T20:00:00.000Z'],
    ['16:00', '2026-09-25T22:00:00.000Z'],
    ['17:59', '2026-09-25T22:00:00.000Z'],
    ['18:00', '2026-09-26T01:00:00.000Z'],
  ]) {
    assert.equal(outfitCoverage(`2026-09-25T${clock}:00.000Z`, 'UTC')?.end, expected);
  }
});

test('coverage resolves its end in the snapshot zone across daylight saving time', () => {
  // New York falls back on 1 November 2026: 01:00 occurs twice. The first closes
  // an evening selection; an open during the second 01:00 runs to 04:00 EST.
  assert.equal(outfitCoverage('2026-11-01T00:00:00.000Z', 'America/New_York')?.end,
    '2026-11-01T05:00:00.000Z');
  assert.equal(outfitCoverage('2026-11-01T06:30:00.000Z', 'America/New_York')?.end,
    '2026-11-01T09:00:00.000Z');
});

test('plan target is the bare next date, including overnight', () => {
  assert.equal(nextBareDressingDayKey('2026-09-24:evening'), '2026-09-25');
  assert.equal(new Intl.DateTimeFormat('en', { timeZone: 'UTC', weekday: 'long' })
    .format(new Date(`${nextBareDressingDayKey('2026-09-24:evening')}T12:00:00.000Z`)), 'Friday');
});
