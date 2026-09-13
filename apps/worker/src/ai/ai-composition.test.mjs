import assert from 'node:assert/strict';
import test from 'node:test';

import { createAiProviders } from '../index.ts';
import { DeterministicStubAiProvider } from './stub-ai-provider.ts';
import { OpenRouterAiProvider } from './openrouter-ai-provider.ts';
import { WorkersAiProvider } from './workers-ai-provider.ts';

const models = ['model/one', 'model/two', 'model/three'];
const ai = { run: async () => ({ response: {} }) };

test('empty environment composes no AI providers', () => {
  assert.deepEqual(createAiProviders({}), []);
});

test('composes one OpenRouter provider per model in model order', () => {
  const providers = createAiProviders({
    OPENROUTER_API_KEY: 'key',
    OPENROUTER_MODELS: models,
  });

  assert.equal(providers.length, 3);
  assert.equal(providers.every((provider) => provider instanceof OpenRouterAiProvider), true);
  assert.deepEqual(providers.map((provider) => provider.model), models);
});

test('composes one Workers AI provider per model in model order', () => {
  const workersAiModels = ['@cf/model-one', '@cf/model-two'];
  const providers = createAiProviders({ AI: ai, WORKERS_AI_MODELS: workersAiModels });

  assert.equal(providers.every((provider) => provider instanceof WorkersAiProvider), true);
  assert.deepEqual(providers.map((provider) => provider.model), workersAiModels);
});

test('composes Workers AI before OpenRouter providers', () => {
  const providers = createAiProviders({
    OPENROUTER_API_KEY: 'key',
    OPENROUTER_MODELS: models,
    AI: ai,
    WORKERS_AI_MODELS: ['@cf/model-one', '@cf/model-two'],
  });

  assert.deepEqual(
    providers.map((provider) => provider.constructor.name),
    [
      'WorkersAiProvider',
      'WorkersAiProvider',
      'OpenRouterAiProvider',
      'OpenRouterAiProvider',
      'OpenRouterAiProvider',
    ],
  );
  assert.equal(providers.some((provider) => provider instanceof DeterministicStubAiProvider), false);
});

test('does not compose OpenRouter without an array of models', () => {
  for (const OPENROUTER_MODELS of [undefined, 'model/one']) {
    const providers = createAiProviders({
      OPENROUTER_API_KEY: 'key',
      OPENROUTER_MODELS,
    });

    assert.deepEqual(providers, []);
  }
});
