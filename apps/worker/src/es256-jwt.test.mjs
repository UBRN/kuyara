import assert from 'node:assert/strict';
import test from 'node:test';

import { generateEs256Key } from './__tests__/es256-test-key.mjs';
import { Es256SigningError, base64UrlDecode, base64UrlEncode, createEs256Signer } from './es256-jwt.ts';

const keyMaterial = generateEs256Key;

test('signs header and payload as a verifiable ES256 compact token', async () => {
  const { keyPair, pem } = await keyMaterial();
  const token = await createEs256Signer(pem)({ alg: 'ES256', kid: 'K1' }, { iss: 'T1', exp: 5 });
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'ES256', kid: 'K1' });
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url').toString()), { iss: 'T1', exp: 5 });
  assert.equal(await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, keyPair.publicKey,
    Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${payload}`),
  ), true);
});

test('accepts a bare base64 key body as well as PEM markers', async () => {
  const { bare } = await keyMaterial();
  assert.equal((await createEs256Signer(bare)({ alg: 'ES256' }, {})).split('.').length, 3);
});

test('a malformed key fails with a closed error that carries no key material', async () => {
  const pem = 'sentinel-key-material';
  await assert.rejects(createEs256Signer(pem)({}, {}), (error) => {
    assert.ok(error instanceof Es256SigningError);
    assert.equal(error.message.includes('sentinel'), false);
    return true;
  });
});

test('imports the key once and re-imports after a failed import', async () => {
  const { pem } = await keyMaterial();
  const realImportKey = globalThis.crypto.subtle.importKey;
  let calls = 0;
  globalThis.crypto.subtle.importKey = function importKey(...args) {
    calls += 1;
    if (calls === 1) return Promise.reject(new Error('transient'));
    return realImportKey.apply(this, args);
  };
  try {
    const sign = createEs256Signer(pem);
    await assert.rejects(sign({}, {}), Es256SigningError);
    await sign({}, {});
    await sign({}, {});
    assert.equal(calls, 2);
  } finally {
    globalThis.crypto.subtle.importKey = realImportKey;
  }
});

test('base64url helpers round trip bytes without padding', () => {
  const bytes = new Uint8Array([251, 255, 254, 0, 1]);
  const encoded = base64UrlEncode(bytes);
  assert.equal(encoded, Buffer.from(bytes).toString('base64url'));
  assert.deepEqual(base64UrlDecode(encoded), bytes);
  assert.equal(base64UrlDecode('***'), null);
});
