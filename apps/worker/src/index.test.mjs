import assert from 'node:assert/strict';
import test from 'node:test';

import worker from './index.ts';

// The memo the worker keeps is per isolate and keyed on the first `env` it sees, so this
// file uses exactly one `env` for every test: a second, different `env` would be ignored
// and the assertion would be measuring the wrong isolate.

async function weatherKitPrivateKeyPem() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  // The token provider treats the PEM markers as optional, so the bare base64 body of a
  // throwaway key generated at test time is valid key material.
  return pkcs8.toString('base64').match(/.{1,64}/gu).join('\n');
}

const probeAnswer = {
  data: {
    picks: [
      { optionId: 'probe-casual', archetypeId: 'weekend_relaxed' },
      { optionId: 'probe-smart', archetypeId: 'smart_casual' },
      { optionId: 'probe-formal', archetypeId: 'office_ready' },
    ],
  },
};

let aiRunCalls = 0;

const env = {
  WORKERS_AI_MODELS: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  AI: {
    async run() {
      aiRunCalls += 1;
      return { response: probeAnswer };
    },
  },
  WEATHERKIT_TEAM_ID: 'TEAM123456',
  WEATHERKIT_SERVICE_ID: 'com.example.weather',
  WEATHERKIT_KEY_ID: 'KEY1234567',
  WEATHERKIT_PRIVATE_KEY: await weatherKitPrivateKeyPem(),
};

function probeRequest() {
  return new Request('https://worker.test/v1/ai/probe', {
    method: 'POST',
    headers: { 'cf-connecting-ip': '203.0.113.10' },
  });
}

function weatherRequest() {
  return new Request('https://worker.test/v1/weather', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': '203.0.113.10',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      latitudeE2: 4101,
      longitudeE2: 2897,
      timeZone: 'Europe/Istanbul',
    }),
  });
}

test('the probe result cache survives across requests', async () => {
  const first = await worker.fetch(probeRequest(), env);
  const second = await worker.fetch(probeRequest(), env);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await first.json()).data.status, 'ok');
  assert.equal((await second.json()).data.status, 'ok');
  assert.equal(
    aiRunCalls,
    1,
    'the second probe request must be served from the 60 s cache, so the AI provider is '
    + 'reached once; composing the probe handler inside fetch throws that cache away.',
  );
});

test('the WeatherKit key is imported and the JWT signed once per isolate', async () => {
  const realFetch = globalThis.fetch;
  const realImportKey = globalThis.crypto.subtle.importKey;
  const realSign = globalThis.crypto.subtle.sign;
  let importKeyCalls = 0;
  let signCalls = 0;
  let upstreamCalls = 0;

  // No network: every upstream call fails, which is an eligible failure, so the chain
  // simply exhausts itself and the route answers 503. The token work still happened.
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error('network disabled in tests');
  };
  globalThis.crypto.subtle.importKey = function importKey(...args) {
    importKeyCalls += 1;
    return realImportKey.apply(this, args);
  };
  globalThis.crypto.subtle.sign = function sign(...args) {
    signCalls += 1;
    return realSign.apply(this, args);
  };

  try {
    const first = await worker.fetch(weatherRequest(), env);
    const second = await worker.fetch(weatherRequest(), env);
    assert.equal(first.status, 503);
    assert.equal(second.status, 503);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.crypto.subtle.importKey = realImportKey;
    globalThis.crypto.subtle.sign = realSign;
  }

  assert.ok(upstreamCalls > 0, 'the chain must have reached at least one upstream provider');
  assert.equal(
    importKeyCalls,
    1,
    'the PKCS8 WeatherKit key must be imported once per isolate; composing the token '
    + 'provider inside fetch re-imports it on every request.',
  );
  assert.equal(
    signCalls,
    1,
    'the ES256 JWT is valid for an hour, so a second request inside that hour must reuse '
    + 'the cached token instead of signing again.',
  );
});
