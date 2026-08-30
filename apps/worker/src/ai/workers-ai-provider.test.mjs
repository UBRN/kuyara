import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkersAiProvider } from './workers-ai-provider.ts';

const request = {
  clothingPreference: 'mens',
  catalogVersion: 2,
  dayVariant: 3,
  requirements: [{
    kind: 'thermal',
    minimum: 'light',
    priority: 'mandatory',
    reasonCodes: ['temperature_low'],
  }],
  options: [{
    optionId: 'option-1',
    formality: 'casual',
    garments: [
      { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: 't_shirt' },
      { slot: 'bottom', layerRole: 'standalone', garmentTypeId: 'trousers' },
      { slot: 'footwear', layerRole: null, garmentTypeId: 'sneakers' },
    ],
    traits: {
      hasMidLayer: false,
      hasOuterLayer: false,
      outerThermalHigh: false,
      outerWaterProtective: false,
      windResistant: false,
      tractionEnhanced: false,
      breathabilityHigh: true,
    },
  }],
};

test('passes a per-request pick schema to the binding and unwraps its response', async () => {
  const expected = { data: { picks: [] } };
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
  const pickProperties = captured.input.response_format.json_schema
    .properties.data.properties.picks.items.properties;
  assert.equal(captured.model, '@cf/model');
  assert.equal(captured.input.max_tokens, 2048);
  assert.equal(captured.input.response_format.type, 'json_schema');
  assert.deepEqual(pickProperties.optionId.enum, ['option-1']);
  assert.equal(pickProperties.archetypeId.enum.length, 12);
  assert.deepEqual(result, expected);
});

test('prompt sends only the approved model inputs', async () => {
  let input;
  const provider = new WorkersAiProvider({
    model: '@cf/model',
    ai: {
      async run(_model, capturedInput) {
        input = capturedInput;
        return { response: {} };
      },
    },
  });
  await provider.generateOutfits(request, new AbortController().signal);
  const payload = JSON.parse(input.messages[1].content);
  assert.deepEqual(payload, {
    clothingPreference: 'mens',
    options: [{
      optionId: 'option-1',
      formality: 'casual',
      garments: [
        { slot: 'primary_top', garmentTypeId: 't_shirt' },
        { slot: 'bottom', garmentTypeId: 'trousers' },
        { slot: 'footwear', garmentTypeId: 'sneakers' },
      ],
    }],
  });
  const serialized = JSON.stringify(payload);
  for (const forbidden of [
    'requirements',
    'reasonCodes',
    'layerRole',
    'traits',
    'catalogVersion',
    'dayVariant',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
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
