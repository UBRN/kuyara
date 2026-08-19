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

test('composes exactly one Workers AI provider without an OpenRouter key', () => {
  const providers = createAiProviders({ AI: ai, WORKERS_AI_MODEL: '@cf/model' });

  assert.equal(providers.length, 1);
  assert.equal(providers[0] instanceof WorkersAiProvider, true);
});

test('composes Workers AI before OpenRouter providers', () => {
  const providers = createAiProviders({
    OPENROUTER_API_KEY: 'key',
    OPENROUTER_MODELS: models,
    AI: ai,
    WORKERS_AI_MODEL: '@cf/model',
  });

  assert.deepEqual(
    providers.map((provider) => provider.constructor.name),
    [
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
