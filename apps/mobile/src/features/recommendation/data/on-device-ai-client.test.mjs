import assert from 'node:assert/strict';
import test from 'node:test';

import { readOnDeviceAiAvailability } from './on-device-ai-client.ts';

function fakeModule(getAvailability) {
  return {
    getAvailability,
    selectOutfits: async () => {
      throw new Error('reading availability never asks the model to select');
    },
  };
}

test('the availability read passes the module answer through', async () => {
  assert.deepEqual(
    await readOnDeviceAiAvailability(fakeModule(async () => ({ status: 'available' }))),
    { status: 'available' },
  );
  assert.deepEqual(
    await readOnDeviceAiAvailability(fakeModule(async () => ({
      status: 'unavailable',
      reason: 'model_not_ready',
    }))),
    { status: 'unavailable', reason: 'model_not_ready' },
  );
});

test('no module at all reads as an ineligible device', async () => {
  assert.deepEqual(await readOnDeviceAiAvailability(null), {
    status: 'unavailable',
    reason: 'device_not_eligible',
  });
});

// A telemetry attribute waits on this read, so a read that throws or never settles answers
// unknown instead of holding it.
test('a read that throws or never settles answers unknown inside its bound', async () => {
  for (const getAvailability of [
    async () => {
      throw new Error('the native call failed');
    },
    () => new Promise(() => undefined),
  ]) {
    assert.deepEqual(await readOnDeviceAiAvailability(fakeModule(getAvailability), 10), {
      status: 'unavailable',
      reason: 'unknown',
    });
  }
});
