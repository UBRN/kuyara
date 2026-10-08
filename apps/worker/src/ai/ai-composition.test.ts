import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiRecommendV2Request } from '@kuyara/contracts';

import { largestAiRecommendV2Request } from '../__tests__/largest-valid-requests.ts';
import { createAiProviders } from '../index.ts';
import { haikuPromptCharacterLimit, haikuPromptCharacters } from './haiku-ai-provider.ts';
import { DeterministicStubAiProvider } from './__tests__/stub-ai-provider.ts';
import { OpenRouterAiProvider } from './openrouter-ai-provider.ts';
import { WorkersAiProvider } from './workers-ai-provider.ts';

const models = ['model/one:free', 'model/two:free', 'model/three:free'];
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
  // A string where the array belongs is the malformed configuration under test.
  const notAnArray = [undefined, 'model/one'] as unknown as (readonly string[] | undefined)[];
  for (const OPENROUTER_MODELS of notAnArray) {
    const providers = createAiProviders({
      OPENROUTER_API_KEY: 'key',
      OPENROUTER_MODELS,
    });

    assert.deepEqual(providers, []);
  }
});

test('rejects paid and malformed OpenRouter slugs without logging their values', (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (warning: unknown) => warnings.push(warning));
  // The 42 is a non-string slug on purpose, so the list is cast past the string[] type.
  const providers = createAiProviders({
    OPENROUTER_API_KEY: 'secret',
    OPENROUTER_MODELS: ['model/paid', 'model/fast:nitro', 'model/web:online', 'model/name:free ', '', 42, 'model/free:free'] as unknown as readonly string[],
  });
  assert.deepEqual(providers.map((provider) => provider.model), ['model/free:free']);
  assert.deepEqual(warnings, Array.from({ length: 6 }, () => ({
    event: 'openrouter_model_rejected',
  })));
});

test('the free-model router is an allowed OpenRouter configuration', () => {
  const providers = createAiProviders({
    OPENROUTER_API_KEY: 'key',
    OPENROUTER_MODELS: ['openrouter/free'],
  });
  assert.deepEqual(providers.map((provider) => provider.model), ['openrouter/free']);
});

// Composition never calls the counter; a namespace is all the cap needs to be built.
const counters = {
  idFromName: (name: string) => name,
  get: () => ({ fetch: async () => Response.json({ count: 1 }) }),
};

test('composes the capped Haiku model ahead of Workers AI and OpenRouter', () => {
  const providers = createAiProviders({
    HAIKU_API_KEY: 'key',
    HAIKU_MODELS: ['claude-haiku-5-5'],
    DAILY_COUNTERS: counters,
    OPENROUTER_API_KEY: 'key',
    OPENROUTER_MODELS: ['model/one:free'],
    AI: ai,
    WORKERS_AI_MODELS: ['@cf/model-one'],
  });
  assert.deepEqual(
    providers.map(({ id, model }) => [id, model]),
    [
      ['haiku', 'claude-haiku-5-5'],
      ['workers-ai', '@cf/model-one'],
      ['openrouter', 'model/one:free'],
    ],
  );
});

test('composes no Haiku provider without its key, its model list or the counter binding', () => {
  for (const env of [
    { HAIKU_MODELS: ['claude-haiku-5-5'], DAILY_COUNTERS: counters },
    { HAIKU_API_KEY: '', HAIKU_MODELS: ['claude-haiku-5-5'], DAILY_COUNTERS: counters },
    { HAIKU_API_KEY: 'key', DAILY_COUNTERS: counters },
    { HAIKU_API_KEY: 'key', HAIKU_MODELS: [], DAILY_COUNTERS: counters },
    { HAIKU_API_KEY: 'key', HAIKU_MODELS: ['claude-haiku-5-5'] },
  ]) {
    assert.deepEqual(createAiProviders(env), []);
  }
});

test('rejects a Haiku model the daily limit was not priced for without logging it', (t) => {
  const warnings: unknown[] = [];
  t.mock.method(console, 'warn', (warning: unknown) => warnings.push(warning));
  const providers = createAiProviders({
    HAIKU_API_KEY: 'secret',
    HAIKU_MODELS: ['claude-haiku-4-5', 'claude-haiku-5-5'],
    DAILY_COUNTERS: counters,
  });
  assert.deepEqual(providers.map((provider) => provider.model), ['claude-haiku-5-5']);
  assert.deepEqual(warnings, [{ event: 'haiku_model_rejected' }]);
});

test('the composed Haiku provider refuses a prompt over its priced size before counting or sending it', async (t) => {
  const counted: string[] = [];
  const sent: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    sent.push(String(url));
    return Response.json({});
  });
  const [haiku] = createAiProviders({
    HAIKU_API_KEY: 'key',
    HAIKU_MODELS: ['claude-haiku-5-5'],
    DAILY_COUNTERS: {
      idFromName: (name: string) => name,
      get: () => ({ fetch: async (url: string) => {
        counted.push(String(url));
        return Response.json({ count: 1 });
      } }),
    },
  });
  const largest = largestAiRecommendV2Request() as AiRecommendV2Request;
  assert.ok(haikuPromptCharacters(largest) > haikuPromptCharacterLimit);
  await assert.rejects(haiku.generateOutfits(largest, new AbortController().signal));
  assert.deepEqual(counted, []);
  assert.deepEqual(sent, []);
});
