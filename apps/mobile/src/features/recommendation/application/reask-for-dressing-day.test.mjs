import assert from 'node:assert/strict';
import test from 'node:test';

import { reaskForDressingDay } from './reask-for-dressing-day.ts';

function harness() {
  const calls = [];
  const refreshes = [];
  return {
    calls,
    refreshes,
    dependencies: {
      localProfileId: 'profile-one',
      currentDayKey: '2026-09-29:evening',
      resolvedDressStyle: 'smart',
      hasCurrentDayChoice: true,
      choiceRepository: {
        upsert: async (_profile, key, formality) => {
          calls.push(['choice', key, formality]);
          return { key, formality };
        },
      },
      departureRepository: {
        upsert: async (_profile, key, departureAt, timeZone) => {
          calls.push(['departure', key, departureAt, timeZone]);
          return { dayKey: key, departureAt, timeZone };
        },
        clear: async (_profile, key) => { calls.push(['clear', key]); return true; },
      },
      currentInput: () => ({ marker: 1 }),
      refresh: async (input) => { refreshes.push(input); return null; },
      now: () => '2026-09-29T21:30:00.000Z',
    },
  };
}

// The device runs in UTC here (the package script pins TZ). 20:00 UTC is evening on the
// device but 16:00 in New York, where the same instant is still the day period.
test('a Later departure is keyed by the device dressing day, not the place time zone', async () => {
  const { calls, refreshes, dependencies } = harness();

  const result = await reaskForDressingDay({
    formality: 'formal',
    departureAt: '2026-09-29T20:00:00.000Z',
    timeZone: 'America/New_York',
  }, dependencies);
  await result.settled;

  assert.deepEqual(calls, [
    ['choice', '2026-09-29:evening', 'formal'],
    ['departure', '2026-09-29:evening', '2026-09-29T20:00:00.000Z', 'America/New_York'],
  ]);
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0].dressStyle, 'formal');
  assert.equal(refreshes[0].departureAt, '2026-09-29T20:00:00.000Z');
  assert.equal(result.departure.dayKey, '2026-09-29:evening');
});
