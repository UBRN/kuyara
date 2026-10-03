// The spend guards no code can enforce at runtime live in wrangler.jsonc: production
// WORKERS_AI_MODELS must stay inside the two models whose Neuron rates
// WORKERS_AI_DAILY_ATTEMPT_LIMIT was derived from (llama-3.3-70b as the worst case), and the
// e2e environment must keep both model lists empty so a local end-to-end run never reaches
// a real AI provider or burns the shared quota. Reads only a repo file, offline.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test, { mock } from 'node:test';

import { createAiProviders } from './index.ts';

mock.method(console, 'warn', () => {});

// wrangler.jsonc carries whole-line comments only, so dropping those lines gives JSON.
const config = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '..', 'wrangler.jsonc'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n'),
);

// The two models the daily attempt limit in ai-handler.ts is sized with. Adding a costlier
// Workers AI model is a spend decision: recalculate the limit there, then this set.
const pricedWorkersAiModels = new Set([
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
]);

const rateLimitNames = [
  'AI_PROBE_RATE_LIMIT',
  'AI_RECOMMEND_RATE_LIMIT',
  'WEATHER_RATE_LIMIT',
  'PLACE_SEARCH_RATE_LIMIT',
  'FEEDBACK_RATE_LIMIT',
];

test('production WORKERS_AI_MODELS stays inside the models the daily attempt limit was priced with', () => {
  const models = config.vars.WORKERS_AI_MODELS;
  assert.ok(models.length > 0);
  for (const model of models) {
    assert.ok(
      pricedWorkersAiModels.has(model),
      `${model} is not one of the priced Workers AI models; recalculate WORKERS_AI_DAILY_ATTEMPT_LIMIT first`,
    );
  }
});

test('every production OPENROUTER_MODELS entry passes the free-model allowlist', () => {
  const models = config.vars.OPENROUTER_MODELS;
  assert.ok(models.length > 0);
  // `createAiProviders` drops a model the allowlist rejects, so a kept count equal to the
  // configured count means none was rejected.
  const providers = createAiProviders({ OPENROUTER_API_KEY: 'key', OPENROUTER_MODELS: models });
  assert.equal(providers.length, models.length);
});

test('the e2e environment configures no AI provider model at all', () => {
  assert.deepEqual(config.env.e2e.vars.WORKERS_AI_MODELS, []);
  assert.deepEqual(config.env.e2e.vars.OPENROUTER_MODELS, []);
});

test('the e2e environment redeclares the Durable Object and rate-limit bindings with its own ids', () => {
  const production = config.ratelimits;
  const e2e = config.env.e2e.ratelimits;
  for (const name of rateLimitNames) {
    assert.ok(production.some((binding) => binding.name === name), `${name} in production`);
    assert.ok(e2e.some((binding) => binding.name === name), `${name} in e2e`);
  }
  const productionIds = production.map((binding) => binding.namespace_id);
  const e2eIds = e2e.map((binding) => binding.namespace_id);
  assert.equal(new Set([...productionIds, ...e2eIds]).size, productionIds.length + e2eIds.length,
    'a shared namespace id would make e2e runs spend the production rate-limit counters');
  for (const bindings of [config.durable_objects.bindings, config.env.e2e.durable_objects.bindings]) {
    assert.ok(bindings.some((binding) => binding.name === 'DAILY_COUNTERS'));
  }
  assert.deepEqual(config.env.e2e.ai, { binding: 'AI' });
});

test('feedback D1 is bound only in the local e2e environment, next to its rate limiter', () => {
  assert.equal(config.d1_databases, undefined);
  assert.equal(config.env.feedback_setup, undefined);
  assert.deepEqual(config.env.e2e.d1_databases, [{
    binding: 'FEEDBACK_DB',
    database_name: 'kuyara-feedback-e2e',
    database_id: '00000000-0000-0000-0000-000000000000',
    migrations_dir: 'migrations',
  }]);
  assert.ok(config.env.e2e.ratelimits.some((binding) => binding.name === 'FEEDBACK_RATE_LIMIT'));
});
