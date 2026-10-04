import assert from 'node:assert/strict';
import test from 'node:test';

import { DailyCounter, createDurableDailyCounter, dailyCounterKey } from './daily-counter.ts';

// A Map-backed stand-in for `DurableObjectState.storage`: the methods the counter uses.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const state = { alarm: null };
  return {
    map,
    state,
    async setAlarm(time) { state.alarm = time; },
    async get(key) { return map.get(key); },
    async put(key, value) { map.set(key, value); },
    async delete(key) { return map.delete(key); },
    async list() { return new Map(map); },
  };
}

function counterObject(initial) {
  const storage = fakeStorage(initial);
  return { storage, counter: new DailyCounter({ storage }, {}) };
}

async function call(counter, method, path) {
  const response = await counter.fetch(new Request(`https://daily-counter${path}`, { method }));
  return { status: response.status, body: response.status === 200 ? await response.json() : null };
}

test('dailyCounterKey is the counter name and the UTC day', () => {
  assert.equal(dailyCounterKey('probe', new Date('2026-09-15T23:59:59.999Z')), 'probe:2026-09-15');
  assert.equal(
    dailyCounterKey('weather:weatherkit', new Date('2026-09-16T00:00:00.000Z')),
    'weather:weatherkit:2026-09-16',
  );
  assert.equal(
    dailyCounterKey('ai:workers-ai', new Date('2026-09-15T22:30:00.000-03:00')),
    'ai:workers-ai:2026-09-16',
  );
});

test('POST /increment returns the new count and persists it', async () => {
  const { counter, storage } = counterObject();
  assert.deepEqual(await call(counter, 'POST', '/increment?key=probe:2026-09-15'), {
    status: 200,
    body: { count: 1 },
  });
  assert.deepEqual(await call(counter, 'POST', '/increment?key=probe:2026-09-15'), {
    status: 200,
    body: { count: 2 },
  });
  assert.equal(storage.map.get('probe:2026-09-15'), 2);
});

test('incrementing a new date key deletes every older stored key', async () => {
  const { counter, storage } = counterObject({
    'probe:2026-09-13': 30,
    'probe:2026-09-14': 12,
  });
  assert.deepEqual(await call(counter, 'POST', '/increment?key=probe:2026-09-15'), {
    status: 200,
    body: { count: 1 },
  });
  assert.deepEqual([...storage.map.entries()], [['probe:2026-09-15', 1]]);
});

// A request that computed yesterday's date key just before UTC midnight may reach the
// object after today's first increment. Its increment recreates yesterday's key at 1 and
// must not take today's count with it; the next new day sweeps both.
test('a straggler incrementing an older key does not delete the newer one', async () => {
  const { counter, storage } = counterObject();
  await call(counter, 'POST', '/increment?key=probe:2026-09-15');
  await call(counter, 'POST', '/increment?key=probe:2026-09-15');
  assert.deepEqual(await call(counter, 'POST', '/increment?key=probe:2026-09-14'), {
    status: 200,
    body: { count: 1 },
  });
  assert.equal(storage.map.get('probe:2026-09-15'), 2);
  assert.equal(storage.map.get('probe:2026-09-14'), 1);
  assert.deepEqual(await call(counter, 'POST', '/increment?key=probe:2026-09-16'), {
    status: 200,
    body: { count: 1 },
  });
  assert.deepEqual([...storage.map.entries()], [['probe:2026-09-16', 1]]);
});

test('rejects a missing key, an unknown path and a wrong method', async () => {
  const { counter } = counterObject();
  assert.equal((await call(counter, 'POST', '/increment')).status, 400);
  assert.equal((await call(counter, 'POST', '/increment?key=')).status, 400);
  assert.equal((await call(counter, 'GET', '/other?key=a')).status, 404);
  assert.equal((await call(counter, 'GET', '/count?key=a')).status, 404);
  assert.equal((await call(counter, 'GET', '/increment?key=a')).status, 405);
});

// An in-memory namespace that instantiates the real class: one object per name, so the
// adapter and the Durable Object are exercised together. The stub takes fetch's
// `(input, init)` and hands the object a `Request`, as the runtime stub does.
function fakeNamespace() {
  const objects = new Map();
  return {
    objects,
    idFromName(name) { return { name }; },
    get(id) {
      let object = objects.get(id.name);
      if (!object) {
        object = new DailyCounter({ storage: fakeStorage() }, {});
        objects.set(id.name, object);
      }
      return { fetch: (input, init) => object.fetch(new Request(input, init)) };
    },
  };
}

test('the adapter increments through the Durable Object stub', async () => {
  const namespace = fakeNamespace();
  const counter = createDurableDailyCounter(namespace, 'probe');
  assert.equal(await counter.increment('probe:2026-09-15'), 1);
  assert.equal(await counter.increment('probe:2026-09-15'), 2);
});

test('different counter names never share an object', async () => {
  const namespace = fakeNamespace();
  const probe = createDurableDailyCounter(namespace, 'probe');
  const weather = createDurableDailyCounter(namespace, 'weather:weatherkit');
  assert.equal(await probe.increment('2026-09-15'), 1);
  assert.equal(await weather.increment('2026-09-15'), 1);
  assert.equal(await probe.increment('2026-09-15'), 2);
  assert.equal(await weather.increment('2026-09-16'), 1);
  assert.deepEqual([...namespace.objects.keys()], ['probe', 'weather:weatherkit']);
});

test('the adapter throws when the object answers anything but 200', async () => {
  const counter = createDurableDailyCounter({
    idFromName: (name) => ({ name }),
    get: () => ({ fetch: async () => new Response('broken', { status: 500 }) }),
  }, 'probe');
  await assert.rejects(counter.increment('probe:2026-09-15'), /500/);
});

// A Durable Object stub is an I/O object bound to the request that created it, and the
// composition holding the adapter is memoised across requests, so the adapter must take a
// fresh stub from the namespace on every call. Seen live in workerd: a stub taken once at
// composition failed every later request with "Cannot perform I/O on behalf of a different
// request".
test('the adapter resolves the stub from the namespace on every call', async () => {
  let stubsTaken = 0;
  const counter = createDurableDailyCounter({
    idFromName: (name) => ({ name }),
    get: () => {
      stubsTaken += 1;
      return { fetch: async () => Response.json({ count: 1 }) };
    },
  }, 'probe');
  assert.equal(stubsTaken, 0);
  await counter.increment('probe:2026-09-15');
  await counter.increment('probe:2026-09-15');
  assert.equal(stubsTaken, 2);
});

const day = 86_400_000;

test('the first increment of a day sets an alarm seven days after that day starts', async () => {
  const { counter, storage } = counterObject();
  await call(counter, 'POST', '/increment?key=ai:member:abc:2026-09-15');
  assert.equal(storage.state.alarm, Date.parse('2026-09-15T00:00:00.000Z') + 7 * day);
});

test('a later new day moves the alarm out', async () => {
  const { counter, storage } = counterObject();
  await call(counter, 'POST', '/increment?key=probe:2026-09-15');
  await call(counter, 'POST', '/increment?key=probe:2026-09-16');
  assert.equal(storage.state.alarm, Date.parse('2026-09-16T00:00:00.000Z') + 7 * day);
});

test('only the first increment of a key touches the alarm', async () => {
  const { counter, storage } = counterObject();
  await call(counter, 'POST', '/increment?key=probe:2026-09-15');
  storage.state.alarm = 1;
  await call(counter, 'POST', '/increment?key=probe:2026-09-15');
  assert.equal(storage.state.alarm, 1);
});

const keyDay = (date) => Date.parse(`${date}T00:00:00.000Z`);

test('the alarm deletes only keys whose seven days are over and re-arms for the earliest left', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: keyDay('2026-09-22') });
  const { counter, storage } = counterObject({
    'ai:member:2026-09-14': 3,
    'ai:member:2026-09-15': 5,
    'ai:member:2026-09-22': 1,
  });
  await counter.alarm();
  assert.deepEqual([...storage.map.entries()], [['ai:member:2026-09-22', 1]], 'the alarm day key survives');
  assert.equal(storage.state.alarm, keyDay('2026-09-29'));
});

test('the alarm empties an object whose keys are all stale and arms nothing', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: keyDay('2026-09-22') });
  const { counter, storage } = counterObject({ 'ai:member:2026-09-15': 5 });
  await counter.alarm();
  assert.equal(storage.map.size, 0);
  assert.equal(storage.state.alarm, null);
});

test('a late request with yesterday\'s key moving the alarm back only ever costs stale days', async (t) => {
  const { counter, storage } = counterObject();
  await call(counter, 'POST', '/increment?key=ai:member:2026-09-22');
  assert.equal(storage.state.alarm, keyDay('2026-09-29'));
  await call(counter, 'POST', '/increment?key=ai:member:2026-09-21');
  assert.equal(storage.state.alarm, keyDay('2026-09-28'), 'the straggler moved the alarm back');
  t.mock.timers.enable({ apis: ['Date'], now: keyDay('2026-09-28') });
  await counter.alarm();
  assert.deepEqual([...storage.map.keys()], ['ai:member:2026-09-22'], 'only the stale day went');
  assert.equal(storage.state.alarm, keyDay('2026-09-29'), 'it re-arms for the earliest remaining expiry');
});

test('a failing alarm API never fails the increment', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { counter, storage } = counterObject();
  storage.setAlarm = async () => { throw new Error('alarm unavailable'); };
  assert.deepEqual(await call(counter, 'POST', '/increment?key=probe:2026-09-15'), {
    status: 200,
    body: { count: 1 },
  });
  assert.equal(storage.map.get('probe:2026-09-15'), 1);
});

test('a key without a date suffix sets no alarm', async () => {
  const { counter, storage } = counterObject();
  await call(counter, 'POST', '/increment?key=probe');
  assert.equal(storage.state.alarm, null);
});
