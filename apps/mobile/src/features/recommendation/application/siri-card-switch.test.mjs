import assert from 'node:assert/strict';
import test from 'node:test';

import { siriCardCheckIntervalMs, syncSiriCardSwitch } from './siri-card-switch.ts';

// ADR 0042 section 7: the device holds the last switch value it received, on when it never had one.

const now = '2026-10-18T09:00:00.000Z';
const hoursBefore = (hours) => new Date(Date.parse(now) - hours * 3_600_000).toISOString();

function harness({ stored = null, answer = null } = {}) {
  const writes = [];
  const published = [];
  let fetches = 0;
  const sync = () => syncSiriCardSwitch({
    store: { read: async () => stored, write: async (value) => { writes.push(value); stored = value; } },
    client: { siriCard: async () => { fetches++; return answer; } },
    now: () => now,
    publish: (value) => published.push(value),
  });
  return { sync, writes, published, fetches: () => fetches };
}

test('a device that never received an answer reads on, and stores what the Worker answers', async () => {
  const fake = harness({ answer: 'off' });
  await fake.sync();
  assert.deepEqual(fake.published, ['on', 'off']);
  assert.deepEqual(fake.writes, [{ siriCard: 'off', checkedAt: now }]);
});

test('no usable answer keeps the last received value, and on when there never was one', async () => {
  const offline = harness({ stored: { siriCard: 'off', checkedAt: hoursBefore(5) } });
  await offline.sync();
  assert.deepEqual(offline.published, ['off']);
  assert.deepEqual(offline.writes, [{ siriCard: 'off', checkedAt: now }]);

  const fresh = harness();
  await fresh.sync();
  assert.deepEqual(fresh.published, ['on']);
  assert.deepEqual(fresh.writes, [{ siriCard: 'on', checkedAt: now }]);
});

test('a check inside the interval publishes the stored value and asks the Worker nothing', async () => {
  assert.equal(siriCardCheckIntervalMs, 4 * 3_600_000);
  const fake = harness({ stored: { siriCard: 'off', checkedAt: hoursBefore(3.9) }, answer: 'on' });
  await fake.sync();
  assert.equal(fake.fetches(), 0);
  assert.deepEqual(fake.published, ['off']);
  assert.deepEqual(fake.writes, []);
});

test('a check after the interval, or stamped in the future by a moved clock, asks again', async () => {
  for (const checkedAt of [hoursBefore(4), hoursBefore(-1)]) {
    const fake = harness({ stored: { siriCard: 'off', checkedAt }, answer: 'on' });
    await fake.sync();
    assert.equal(fake.fetches(), 1, checkedAt);
    assert.deepEqual(fake.published, ['off', 'on'], checkedAt);
  }
});

test('an unchanged answer is published once', async () => {
  const fake = harness({ stored: { siriCard: 'on', checkedAt: hoursBefore(6) }, answer: 'on' });
  await fake.sync();
  assert.deepEqual(fake.published, ['on']);
});
