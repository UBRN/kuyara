import assert from 'node:assert/strict';
import test from 'node:test';

import { OnDeviceAiClient, OnDeviceAiError } from './on-device-ai-client.ts';

// The projection is a plain field copy, so an empty option list is a whole request here.
const request = { clothingPreference: 'womens', options: [] };

async function developmentWarningsFor(nativeMessage) {
  const previousDevelopment = globalThis.__DEV__;
  const previousWarn = console.warn;
  const lines = [];
  globalThis.__DEV__ = true;
  console.warn = (line) => lines.push(line);
  try {
    const client = new OnDeviceAiClient({
      module: {
        getAvailability: async () => ({ status: 'available' }),
        selectOutfits: async () => {
          throw new Error(nativeMessage);
        },
      },
      timeoutMilliseconds: 50,
    });
    await assert.rejects(
      client.recommend(request),
      (error) => error instanceof OnDeviceAiError,
    );
  } finally {
    console.warn = previousWarn;
    if (previousDevelopment === undefined) delete globalThis.__DEV__;
    else globalThis.__DEV__ = previousDevelopment;
  }
  return lines;
}

test('the development line names a failure code the native module wrote', async () => {
  for (const [message, expected] of [
    [
      'On-device selection could not be completed. (exceeded_context_window)',
      'exceeded_context_window',
    ],
    ['On-device selection could not be completed. (refusal)', 'refusal'],
    // Anything outside the closed list is reported as unknown, so neither framework text
    // nor model output can leave the module by riding on the message.
    ['The model objected at length to the request it was given.', 'unknown'],
  ]) {
    assert.deepEqual(await developmentWarningsFor(message), [
      `On-device AI selection failed: ${expected}.`,
    ]);
  }
});
