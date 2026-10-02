import assert from 'node:assert/strict';
import test from 'node:test';

import { closetSeedInputs } from './closet-seed.ts';
import { WardrobeApplicationController } from './wardrobe-application-controller.ts';

const profileId = '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4';

test('an outfit seeds one record per garment type, in its drawn colour family, all with the chosen ownership', () => {
  const pieces = [
    { garmentTypeId: 'rain_jacket', colorFamily: 'blue' },
    { garmentTypeId: 't_shirt', colorFamily: null },
    { garmentTypeId: 'rain_jacket', colorFamily: 'green' },
  ];
  for (const entryState of ['owned', 'wanted']) {
    const inputs = closetSeedInputs(pieces, entryState);
    assert.deepEqual(inputs, [
      { garmentTypeId: 'rain_jacket', colorFamily: 'blue', entryState },
      { garmentTypeId: 't_shirt', colorFamily: null, entryState },
    ]);
    assert.ok(Object.isFrozen(inputs) && Object.isFrozen(inputs[0]));
  }
});

function memoryRepository() {
  const items = [];
  let next = 0;
  const calls = { create: 0 };
  return {
    calls,
    items,
    async listActiveItems() { return [...items]; },
    async listPendingPhotoCleanup() { return []; },
    async createItem(input) {
      calls.create += 1;
      next += 1;
      const at = `2026-10-02T10:00:0${next}.000Z`;
      const item = {
        id: `00000000-0000-4000-8000-00000000000${next}`, localProfileId: input.localProfileId, name: null,
        category: 'top', entryState: input.entryState ?? 'owned', color: null, photoRelativePath: null,
        garmentTypeId: input.garmentTypeId, colorFamily: input.colorFamily ?? null, colorChoice: null,
        thermalLevelOverride: null, waterProtectionOverride: null, windProtectionOverride: null,
        breathabilityOverride: null, armCoverageOverride: null, legCoverageOverride: null,
        tractionSuitabilityOverride: null, createdAt: at, updatedAt: at, deletedAt: null,
      };
      items.push(item);
      return item;
    },
  };
}

test('seeding an empty Closet creates every piece through the repository in one change', async () => {
  const repository = memoryRepository();
  const controller = new WardrobeApplicationController(profileId, async () => repository);
  await controller.initialize();
  const inputs = closetSeedInputs([
    { garmentTypeId: 'rain_jacket', colorFamily: 'blue' },
    { garmentTypeId: 'rain_boots', colorFamily: 'black' },
  ], 'owned');

  const created = await controller.seedEmptyCloset(inputs);
  assert.deepEqual(created.map(({ garmentTypeId, colorFamily, entryState, localProfileId }) =>
    ({ garmentTypeId, colorFamily, entryState, localProfileId })), [
    { garmentTypeId: 'rain_jacket', colorFamily: 'blue', entryState: 'owned', localProfileId: profileId },
    { garmentTypeId: 'rain_boots', colorFamily: 'black', entryState: 'owned', localProfileId: profileId },
  ]);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.status, 'ready');
  assert.equal(snapshot.items.length, 2);
  assert.equal(snapshot.isMutating, false);
});

test('a second seed, concurrent or later, never duplicates the pieces', async () => {
  const repository = memoryRepository();
  const controller = new WardrobeApplicationController(profileId, async () => repository);
  await controller.initialize();
  const inputs = closetSeedInputs([{ garmentTypeId: 'rain_jacket', colorFamily: 'blue' }], 'wanted');

  const first = controller.seedEmptyCloset(inputs);
  await assert.rejects(controller.seedEmptyCloset(inputs), /already in progress/);
  assert.equal((await first).length, 1);
  assert.deepEqual(await controller.seedEmptyCloset(inputs), []);
  assert.equal(repository.calls.create, 1);
  assert.equal(repository.items.length, 1);
});
