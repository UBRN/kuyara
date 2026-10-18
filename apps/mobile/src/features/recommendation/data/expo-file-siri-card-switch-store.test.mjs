import assert from 'node:assert/strict';
import test from 'node:test';
import { installFakeExpoFileSystem } from '../../../../test/fakes/expo-file-system.mjs';

const fileSystem = installFakeExpoFileSystem();
const { files } = fileSystem;
const { ExpoFileSiriCardSwitchStore } = await import('./expo-file-siri-card-switch-store.ts');

const switchPath = 'file:///documents/kuyara/recommendation/siri-card.json';
const stored = { siriCard: 'off', checkedAt: '2026-10-18T09:00:00.000Z' };

test.beforeEach(() => {
  files.clear();
  fileSystem.readFailure = false;
  fileSystem.writeFailure = false;
});

test('the last answer survives in app-private storage', async () => {
  const store = new ExpoFileSiriCardSwitchStore();
  assert.equal(await store.read(), null);
  await store.write(stored);
  assert.equal(files.get(switchPath), JSON.stringify(stored));
  assert.deepEqual(await new ExpoFileSiriCardSwitchStore().read(), stored);
});

test('content that does not parse, or a file that cannot be read, reads as never received', async () => {
  for (const text of ['not json', '', 'null', '[]', '{"siriCard":"off"}', '{"siriCard":"maybe","checkedAt":"2026-10-18T09:00:00.000Z"}',
    '{"siriCard":"off","checkedAt":"yesterday"}']) {
    files.set(switchPath, text);
    assert.equal(await new ExpoFileSiriCardSwitchStore().read(), null, text);
  }
  files.set(switchPath, JSON.stringify(stored));
  fileSystem.readFailure = true;
  assert.equal(await new ExpoFileSiriCardSwitchStore().read(), null);
});

test('a failed write keeps the previous file', async () => {
  files.set(switchPath, JSON.stringify(stored));
  fileSystem.writeFailure = true;
  await new ExpoFileSiriCardSwitchStore().write({ siriCard: 'on', checkedAt: '2026-10-18T13:00:00.000Z' });
  assert.equal(files.get(switchPath), JSON.stringify(stored));
});
