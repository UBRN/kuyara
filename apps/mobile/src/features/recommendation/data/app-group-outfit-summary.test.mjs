import assert from 'node:assert/strict';
import test from 'node:test';
import { installFakeExpoFileSystem } from '../../../../test/fakes/expo-file-system.mjs';

// ADR 0042 section 3: the summary file in the App Group container, written whole.
const container = 'file:///app-group';
const fileSystem = installFakeExpoFileSystem({
  appleSharedContainers: { 'group.com.ubrn.kuyara': container },
});
const { files } = fileSystem;

const { writeOutfitSummary } = await import('./app-group-outfit-summary.ts');

const target = `${container}/outfit-summary.json`;
const summary = Object.freeze({
  version: 1, language: 'en', timeZone: 'Europe/Istanbul',
  validFrom: '2026-10-11T01:00:00.000Z', validUntil: '2026-10-11T15:00:00.000Z',
  spokenLine: "Today’s outfit is Easy Weekend: T-shirt, Jeans, Sneakers.",
  labels: { anotherOption: 'Another option' },
  outfits: [{ optionId: 'outfit:1', name: 'Easy Weekend', pieces: ['T-shirt', 'Jeans', 'Sneakers'] }],
});

test.beforeEach(() => {
  files.clear();
  fileSystem.writeFailure = false;
  fileSystem.moveFailure = false;
});

test('the summary replaces the file through a temporary file and leaves nothing else behind', () => {
  files.set(target, '{"version":1,"old":true}');
  writeOutfitSummary(summary);
  assert.deepEqual([...files.keys()], [target]);
  assert.deepEqual(JSON.parse(files.get(target)), summary);
});

test('a failed write or move keeps the previous file, and the next write replaces it', () => {
  files.set(target, 'previous');
  fileSystem.writeFailure = true;
  writeOutfitSummary(summary);
  assert.deepEqual([...files.entries()], [[target, 'previous']]);
  fileSystem.writeFailure = false;
  fileSystem.moveFailure = true;
  writeOutfitSummary(summary);
  assert.equal(files.get(target), 'previous');
  fileSystem.moveFailure = false;
  writeOutfitSummary(summary);
  assert.deepEqual([...files.keys()], [target]);
  assert.deepEqual(JSON.parse(files.get(target)), summary);
});
