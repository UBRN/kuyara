import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import type { AiRecommendV1Request, AiRecommendV2Request } from '@kuyara/contracts';

import { buildMessages, buildPickJsonSchema } from './ai-prompt.ts';
import { AiProviderError } from './ai-provider.ts';
import {
  HAIKU_DAILY_ATTEMPT_LIMIT,
  HaikuAiProvider,
  haikuPromptCharacterLimit,
  haikuPromptCharacters,
} from './haiku-ai-provider.ts';
import { largestAiRecommendV2Request } from '../__tests__/largest-valid-requests.ts';
import { createDailyCappedAiProvider } from './daily-capped-ai-provider.ts';

mock.method(console, 'info', () => {});

const request: AiRecommendV2Request = {
  clothingPreference: 'womens',
  catalogVersion: 3,
  dayVariant: 0,
  locale: 'tr',
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

const picks = { data: {
  picks: [{ optionId: 'option-1', archetypeId: 'everyday_easy' }],
  insightSentence: 'Bugün rahat parçalar seçtik.',
} };

type Captured = { url: string; init: RequestInit & { headers: Record<string, string> } };

function provider(answer: () => Response, captured: Captured[] = []) {
  return new HaikuAiProvider({
    apiKey: 'test-key',
    model: 'claude-haiku-5-5',
    fetch: async (url, init) => {
      captured.push({ url: String(url), init: init as Captured['init'] });
      return answer();
    },
  });
}

function message(text: string, stopReason = 'end_turn') {
  return Response.json({
    stop_reason: stopReason,
    content: [{ type: 'text', text }],
    usage: { input_tokens: 8216, output_tokens: 160 },
  });
}

async function failure(response: Response): Promise<Error & { kind?: string }> {
  return provider(() => response)
    .generateOutfits(request, new AbortController().signal)
    .then(() => assert.fail('expected a failure'), (error: Error & { kind?: string }) => error);
}

test('posts the v2 prompt with thinking off at low effort and a schema the API accepts', async () => {
  const captured: Captured[] = [];
  const output = await provider(() => message(JSON.stringify(picks)), captured)
    .generateOutfits(request, new AbortController().signal);

  assert.deepEqual(output, picks);
  const [{ url, init }] = captured;
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], 'test-key');
  assert.equal(init.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(String(init.body));
  const [system, user] = buildMessages(request);
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.equal(body.max_tokens, 256);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.system, system.content);
  assert.deepEqual(body.messages, [{ role: 'user', content: user.content }]);
  assert.equal('temperature' in body, false);
  // The same schema minus the constraints structured outputs reject.
  const schema = JSON.stringify(body.output_config.format.schema);
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.doesNotMatch(schema, /minItems|maxItems|minLength|maxLength/);
  assert.match(JSON.stringify(buildPickJsonSchema(request.options, true)), /maxItems/);
  assert.match(schema, /"insightSentence":\{"type":"string"\}/);
  assert.match(schema, /"enum":\["option-1"\]/);
});

test('a caller may lower the output ceiling but never raise it past the priced one', async () => {
  const captured: Captured[] = [];
  for (const maxTokens of [64, 4096]) {
    await provider(() => message(JSON.stringify(picks)), captured)
      .generateOutfits(request, new AbortController().signal, { maxTokens });
  }
  assert.deepEqual(captured.map(({ init }) => JSON.parse(String(init.body)).max_tokens), [64, 256]);
});

test('logs the API token counts of a successful call and nothing else', async (t) => {
  const infos: unknown[] = [];
  t.mock.method(console, 'info', (entry: unknown) => infos.push(entry));
  await provider(() => message(JSON.stringify(picks))).generateOutfits(request, new AbortController().signal);
  assert.deepEqual(infos, [{
    event: 'ai_provider_usage',
    model: 'claude-haiku-5-5',
    promptTokens: 8216,
    completionTokens: 160,
  }]);
});

test('a refusal, a reply cut off at the ceiling, prose or a missing text block is invalid', async () => {
  for (const response of [
    message(JSON.stringify(picks), 'refusal'),
    message('{"data":{"picks":[', 'max_tokens'),
    message('Here are three outfits.'),
    Response.json({ stop_reason: 'end_turn', content: [] }),
  ]) {
    const error = await failure(response);
    assert.equal(error instanceof AiProviderError, false);
    assert.equal(error.message, 'Haiku response invalid.');
  }
});

test('a spent credit or a reached spend limit is quota, never the upstream text', async () => {
  for (const response of [
    Response.json({ type: 'error', error: { type: 'billing_error', message: 'x' } }, { status: 402 }),
    Response.json({ type: 'error', error: { type: 'invalid_request_error',
      message: 'Your credit balance is too low to access the API.' } }, { status: 400 }),
    Response.json({ type: 'error', error: { type: 'rate_limit_error',
      message: 'Spend limit reached.', error_code: 'enforced_spend_limit_reached' } }, { status: 429 }),
  ]) {
    const error = await failure(response);
    assert.equal(error.kind, 'quota_exceeded');
    assert.equal(error.message, 'AI provider failed: quota_exceeded');
  }
});

test('a plain 429 is a rate limit and other failures stay unclassified', async () => {
  const limited = await failure(Response.json(
    { type: 'error', error: { type: 'rate_limit_error', message: 'Too many requests.' } },
    { status: 429 },
  ));
  assert.equal(limited.kind, 'rate_limited');
  for (const status of [400, 401, 500, 529]) {
    const error = await failure(Response.json(
      { type: 'error', error: { type: 'api_error', message: 'secret upstream detail' } },
      { status },
    ));
    assert.equal(error instanceof AiProviderError, false);
    assert.equal(error.message, 'Haiku request failed.');
  }
});

// The shared grid is a plain `.mjs` module without declarations, so it is imported through
// a variable specifier and given the one shape this test reads.
type GridModule = {
  gridRequestCells(): { request: AiRecommendV1Request | null }[];
};
const gridResolverSpecifier = '../../../mobile/test/node-typescript-resolver.mjs';
const gridSpecifier = '../../../mobile/test/recommendation-grid.mjs';

test('the priced prompt size covers every grid prompt and the limit derives from it', async () => {
  await import(gridResolverSpecifier);
  const { gridRequestCells } = (await import(gridSpecifier)) as GridModule;
  // The grid models a weekday caller, but the app also sends weekends and no day kind at all,
  // and the sentence instruction names the locale: every combination is measured.
  const promptCharacters = Math.max(...gridRequestCells()
    .filter((cell): cell is { request: AiRecommendV1Request } => cell.request !== null)
    .flatMap(({ request: { dayKind: _gridDayKind, ...body } }) =>
      [{ dayKind: 'weekday' as const }, { dayKind: 'weekend' as const }, {}].flatMap((day) =>
        (['en', 'tr'] as const).map((locale) => haikuPromptCharacters({ ...body, ...day, locale })))));
  assert.equal(promptCharacters, 18_014);
  // Rounded up, never so far that the price stops describing the prompt.
  assert.ok(promptCharacters <= haikuPromptCharacterLimit && haikuPromptCharacterLimit - promptCharacters < 200);

  // One token per character is the ceiling because the prompt is ASCII, even for the largest
  // request the contract admits.
  const largest = largestAiRecommendV2Request() as AiRecommendV2Request;
  assert.match(JSON.stringify(buildMessages(largest)), /^[\x20-\x7e]*$/);
  // Micro-USD at 0.10 per 1M input tokens and 0.50 per 1M output tokens, 256 output tokens,
  // in tenths so the arithmetic stays in integers.
  const attemptMicroUsd = Math.ceil((haikuPromptCharacterLimit * 1 + 256 * 5) / 10);
  assert.equal(attemptMicroUsd, 1_948);
  assert.equal(HAIKU_DAILY_ATTEMPT_LIMIT, Math.floor(200_000_000 / 31 / attemptMicroUsd));
  assert.ok(HAIKU_DAILY_ATTEMPT_LIMIT * attemptMicroUsd * 31 <= 200_000_000);
});


function counter(start = 0, { fail = false } = {}) {
  const keys: string[] = [];
  let count = start;
  return {
    keys,
    port: {
      async increment(key: string) {
        keys.push(key);
        if (fail) throw new Error('Daily counter answered 500.');
        count += 1;
        return count;
      },
    },
  };
}

function capped(state: ReturnType<typeof counter>, calls: string[], admits = () => true) {
  return createDailyCappedAiProvider({
    provider: {
      id: 'haiku',
      model: 'claude-haiku-5-5',
      async generateOutfits() {
        calls.push('called');
        return picks;
      },
    },
    counter: state.port,
    counterName: 'ai:haiku',
    dailyLimit: 2,
    admits,
    now: () => new Date('2026-10-08T23:59:59.000Z'),
  });
}

test('the cap counts each attempt under the UTC day and calls through up to the limit', async () => {
  const state = counter(1);
  const calls: string[] = [];
  const wrapped = capped(state, calls);
  assert.equal(wrapped.id, 'haiku');
  assert.equal(wrapped.model, 'claude-haiku-5-5');
  assert.deepEqual(await wrapped.generateOutfits(request, new AbortController().signal), picks);
  assert.deepEqual(state.keys, ['ai:haiku:2026-10-08']);
  assert.deepEqual(calls, ['called']);
});

test('over the limit the cap refuses as quota without calling the provider', async () => {
  const calls: string[] = [];
  await assert.rejects(
    capped(counter(2), calls).generateOutfits(request, new AbortController().signal),
    (error: Error & { kind?: string }) => error.kind === 'quota_exceeded',
  );
  assert.deepEqual(calls, []);
});

test('a failing counter never reaches the paid provider uncounted', async () => {
  const calls: string[] = [];
  await assert.rejects(
    capped(counter(0, { fail: true }), calls).generateOutfits(request, new AbortController().signal),
  );
  assert.deepEqual(calls, []);
});

test('a request the price does not cover is refused before it is counted or sent', async () => {
  const state = counter(0);
  const calls: string[] = [];
  await assert.rejects(
    capped(state, calls, () => false).generateOutfits(request, new AbortController().signal),
    { message: 'Request outside the priced size.' },
  );
  assert.deepEqual(state.keys, []);
  assert.deepEqual(calls, []);
});
