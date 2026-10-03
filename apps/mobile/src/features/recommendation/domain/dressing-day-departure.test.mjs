import assert from 'node:assert/strict';
import test from 'node:test';

import { departureIsAhead, departureOptions, quarterHourMs } from './dressing-day-departure.ts';

const now = Date.parse('2026-09-24T13:02:00.000Z');

test('the wheel offers quarter hours after now over the next 12 hours', () => {
  const options = departureOptions(now);
  assert.equal(options[0], '2026-09-24T13:15:00.000Z');
  assert.equal(options.at(-1), '2026-09-25T01:00:00.000Z');
  assert.equal(options.length, 48);
  assert.deepEqual(new Set(options.slice(1).map((option, index) =>
    Date.parse(option) - Date.parse(options[index]))), new Set([quarterHourMs]));
});

test('a quarter hour on the dot is not offered, the next one is', () => {
  assert.equal(departureOptions(Date.parse('2026-09-24T13:15:00.000Z'))[0], '2026-09-24T13:30:00.000Z');
});

test('a departure is ahead only while its instant is after now', () => {
  assert.equal(departureIsAhead({ departureAt: '2026-09-24T13:02:00.001Z' }, now), true);
  assert.equal(departureIsAhead({ departureAt: '2026-09-24T13:02:00.000Z' }, now), false);
  assert.equal(departureIsAhead({ departureAt: '2026-09-24T12:00:00.000Z' }, now), false);
  assert.equal(departureIsAhead({ departureAt: 'soon' }, now), false);
});
