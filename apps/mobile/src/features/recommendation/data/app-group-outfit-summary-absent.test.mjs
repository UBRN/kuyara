import assert from 'node:assert/strict';
import test from 'node:test';
import { installFakeExpoFileSystem } from '../../../../test/fakes/expo-file-system.mjs';

// Android and an iOS build without the App Group entitlement expose no container: nothing is written.
const fileSystem = installFakeExpoFileSystem();

const { writeOutfitSummary } = await import('./app-group-outfit-summary.ts');

test('without the App Group container the writer does nothing', () => {
  writeOutfitSummary({ version: 1 });
  assert.equal(fileSystem.files.size, 0);
});
