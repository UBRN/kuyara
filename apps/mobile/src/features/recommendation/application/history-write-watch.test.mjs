import assert from 'node:assert/strict';
import test from 'node:test';

import { createHistoryWriteWatch } from './history-write-watch.ts';

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('History reads again and removes deleted looks\' photos only when a write changed it', async () => {
  let key = 'a';
  const calls = [];
  const watch = createHistoryWriteWatch({
    changeKey: async () => key,
    cleanupPendingPhotos: async () => { calls.push('cleanup'); },
    changed: () => calls.push('changed'),
  });
  watch();
  await settle();
  assert.deepEqual(calls, []);
  key = 'b';
  watch();
  await settle();
  assert.deepEqual(calls, ['changed', 'cleanup']);
  watch();
  await settle();
  assert.deepEqual(calls, ['changed', 'cleanup']);
});

test('writes during a read get one more read after it, and a failed read changes nothing', async () => {
  let key = 'a';
  let reads = 0;
  let fail = false;
  const calls = [];
  const watch = createHistoryWriteWatch({
    changeKey: async () => {
      reads += 1;
      if (fail) throw new Error('unavailable');
      return key;
    },
    cleanupPendingPhotos: async () => {},
    changed: () => calls.push('changed'),
  });
  watch();
  await settle();
  key = 'b';
  watch();
  watch();
  watch();
  await settle();
  await settle();
  assert.equal(reads, 3);
  assert.deepEqual(calls, ['changed']);
  fail = true;
  watch();
  await settle();
  assert.deepEqual(calls, ['changed']);
});
