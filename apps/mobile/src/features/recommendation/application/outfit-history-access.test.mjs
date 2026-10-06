import assert from 'node:assert/strict';
import test from 'node:test';

import { createOutfitHistoryAccess } from './outfit-history-access.ts';

const settle = () => new Promise((resolve) => setImmediate(resolve));

function recordingRepository({ cleanupFails = false } = {}) {
  const calls = [];
  let key = 'a';
  return {
    calls,
    setKey: (next) => { key = next; },
    repository: {
      list: async (profileId) => { calls.push(['list', profileId]); return ['look']; },
      day: async (profileId, dayKey) => { calls.push(['day', profileId, dayKey]); return ['morning']; },
      log: async (profileId, dayKey, outfit, photo, pieceColors) => {
        calls.push(['log', profileId, dayKey, outfit, photo, pieceColors]);
        return { id: 'record-one' };
      },
      cleanupPendingPhotos: async (profileId) => {
        calls.push(['cleanup', profileId]);
        if (cleanupFails) throw new Error('busy');
      },
      changeKey: async (profileId) => { calls.push(['changeKey', profileId]); return key; },
    },
  };
}

function accessFor(repository) {
  let changes = 0;
  const access = createOutfitHistoryAccess({
    localProfileId: 'profile-one',
    loadRepository: async () => repository,
    changed: () => { changes += 1; },
  });
  return { access, changes: () => changes };
}

test('opening History reads it and retries pending photo removal, whose failure is silent', async () => {
  const { calls, repository } = recordingRepository({ cleanupFails: true });
  const { access, changes } = accessFor(repository);
  assert.deepEqual(await access.list(), ['look']);
  await settle();
  assert.deepEqual(calls, [['list', 'profile-one'], ['cleanup', 'profile-one']]);
  assert.equal(changes(), 0);
});

test('a day reads its looks and changes nothing', async () => {
  const { calls, repository } = recordingRepository();
  const { access, changes } = accessFor(repository);
  assert.deepEqual(await access.day('2026-09-24'), ['morning']);
  assert.deepEqual(calls, [['day', 'profile-one', '2026-09-24']]);
  assert.equal(changes(), 0);
});

test('a recorded look keeps its photo as it is and tells readers to read again', async () => {
  const { calls, repository } = recordingRepository();
  const { access, changes } = accessFor(repository);
  const outfit = { garments: {} };
  assert.deepEqual(await access.log('2026-09-24', outfit, null), { id: 'record-one' });
  assert.deepEqual(calls, [['log', 'profile-one', '2026-09-24', outfit, { kind: 'keep' }, null]]);
  assert.equal(changes(), 1);
});

test('a write another source made tells readers to read again, from a fresh baseline per watch', async () => {
  const { calls, repository, setKey } = recordingRepository();
  const { access, changes } = accessFor(repository);
  const check = access.writeWatch();
  check();
  await settle();
  assert.equal(changes(), 0);
  setKey('b');
  check();
  await settle();
  assert.equal(changes(), 1);
  assert.deepEqual(calls.at(-1), ['cleanup', 'profile-one']);

  const next = access.writeWatch();
  next();
  await settle();
  assert.equal(changes(), 1);
});
