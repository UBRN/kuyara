import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkersAiProvider } from './workers-ai-provider.ts';

const request = {
  clothingPreference: 'mens',
  requirements: [{
    kind: 'thermal',
    minimum: 'light',
    priority: 'mandatory',
    reasonCodes: ['temperature_low'],
  }],
  candidates: [],
};

test('passes structured output input to the binding and unwraps its response', async () => {
  const expected = { data: { outfits: [] } };
  let captured;
  const provider = new WorkersAiProvider({
    model: '@cf/model',
    ai: {
      async run(model, input) {
        captured = { model, input };
        return { response: expected };
      },
    },
  });

  const result = await provider.generateOutfits(
    request,
    new AbortController().signal,
  );

  assert.equal(captured.model, '@cf/model');
  assert.equal(captured.input.max_tokens, 2048);
  assert.equal(captured.input.response_format.type, 'json_schema');
  assert.equal(captured.input.response_format.json_schema.type, 'object');
  assert.deepEqual(result, expected);
});

test('rejects missing or non-object responses', async () => {
  for (const result of [null, {}, { response: null }, { response: 'not an object' }]) {
    const provider = new WorkersAiProvider({
      model: '@cf/model',
      ai: { run: async () => result },
    });

    await assert.rejects(
      provider.generateOutfits(request, new AbortController().signal),
    );
  }
});

test('rejects an already-aborted signal before calling the binding', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const provider = new WorkersAiProvider({
    model: '@cf/model',
    ai: {
      async run() {
        calls += 1;
        return { response: {} };
      },
    },
  });

  await assert.rejects(provider.generateOutfits(request, controller.signal));
  assert.equal(calls, 0);
});
