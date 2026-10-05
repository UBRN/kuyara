import assert from 'node:assert/strict';
import test from 'node:test';

import { dateKeyWeekday, percentage, showsChance } from './weather-format.ts';

test('a forecast day names the weekday of its own date, not of some zone\'s instant', () => {
  // 2026-10-01 is a Thursday everywhere, including west of Greenwich.
  assert.equal(dateKeyWeekday('2026-10-01', 'en', 'long'), 'Thursday');
  assert.equal(dateKeyWeekday('2026-10-01', 'en', 'short'), 'Thu');
  assert.equal(dateKeyWeekday('2026-10-01', 'tr', 'long'), 'Perşembe');
});

// A chance that rounds to "0%" is shown as a dry hour or day, never as "0%": the check reads
// the same rounding the percentage is written with.
test('a chance shows only when it rounds to at least one percent', () => {
  assert.equal(showsChance(0), false);
  assert.equal(showsChance(0.004), false);
  assert.equal(showsChance(0.005), true);
  assert.equal(showsChance(0.2), true);
  for (let step = 0; step <= 200; step += 1) {
    const value = step / 10_000;
    for (const language of ['en', 'tr']) {
      assert.equal(showsChance(value), !/^%?0%?$/.test(percentage(value, language)), `${value} ${language}`);
    }
  }
});
