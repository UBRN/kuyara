import assert from 'node:assert/strict';
import test from 'node:test';

import { createWeatherKitTokenProvider } from './weatherkit-token.ts';
import { WeatherProviderError } from './weather-provider-error.ts';

function base64UrlToJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function credentials() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
  const privateKeyPem = [
    '-----BEGIN PRIVATE KEY-----',
    pkcs8.toString('base64').match(/.{1,64}/gu).join('\n'),
    '-----END PRIVATE KEY-----',
  ].join('\n');

  return {
    keyPair,
    value: {
      teamId: 'TEAM123456',
      serviceId: 'com.example.weather',
      keyId: 'KEY1234567',
      privateKeyPem,
    },
  };
}

test('generates a verifiable ES256 WeatherKit JWT', async () => {
  const { keyPair, value } = await credentials();
  const now = new Date('2026-09-03T12:00:00.000Z');
  const token = await createWeatherKitTokenProvider(value, { now: () => now })();
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');

  assert.deepEqual(base64UrlToJson(encodedHeader), {
    alg: 'ES256',
    kid: 'KEY1234567',
    id: 'TEAM123456.com.example.weather',
    typ: 'JWT',
  });
  assert.deepEqual(base64UrlToJson(encodedPayload), {
    iss: 'TEAM123456',
    sub: 'com.example.weather',
    iat: 1788436800,
    exp: 1788440400,
  });
  assert.equal(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.publicKey,
      Buffer.from(encodedSignature, 'base64url'),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    ),
    true,
  );
});

test('reuses a cached token while more than 300 seconds remain', async () => {
  const { value } = await credentials();
  let now = new Date('2026-09-03T12:00:00.000Z');
  const tokenProvider = createWeatherKitTokenProvider(value, { now: () => now });

  const first = await tokenProvider();
  now = new Date('2026-09-03T12:30:00.000Z');

  assert.equal(await tokenProvider(), first);
});

test('re-signs when fewer than 300 seconds remain', async () => {
  const { value } = await credentials();
  let now = new Date('2026-09-03T12:00:00.000Z');
  const tokenProvider = createWeatherKitTokenProvider(value, {
    now: () => now,
    lifetimeSeconds: 600,
  });

  const first = await tokenProvider();
  now = new Date('2026-09-03T12:05:01.000Z');

  assert.notEqual(await tokenProvider(), first);
});

test('classifies malformed private keys as auth without leaking key data', async () => {
  const privateKeyPem = [
    '-----BEGIN PRIVATE KEY-----',
    'sentinel-private-key-material',
    '-----END PRIVATE KEY-----',
  ].join('\n');
  const tokenProvider = createWeatherKitTokenProvider({
    teamId: 'TEAM123456',
    serviceId: 'com.example.weather',
    keyId: 'KEY1234567',
    privateKeyPem,
  });

  await assert.rejects(tokenProvider(), (error) => {
    assert.ok(error instanceof WeatherProviderError);
    assert.equal(error.kind, 'auth');
    assert.equal(error.message.includes(privateKeyPem), false);
    assert.equal(error.message.includes('sentinel-private-key-material'), false);
    return true;
  });
});
