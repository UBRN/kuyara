import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import test from 'node:test';

import { createEncryptedSessionStorage, utf8Bytes, utf8Text } from './encrypted-session-storage.ts';

// AES-256-GCM in the layout expo-crypto's combined form uses: 12-byte IV, ciphertext, 16-byte tag.
const cipher = {
  newKey: async () => randomBytes(32).toString('base64'),
  seal: async (key, plaintext) => {
    const iv = randomBytes(12);
    const aes = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
    const body = Buffer.concat([aes.update(plaintext), aes.final()]);
    return Buffer.concat([iv, body, aes.getAuthTag()]).toString('base64');
  },
  open: async (key, sealed) => {
    const bytes = Buffer.from(sealed, 'base64');
    const aes = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), bytes.subarray(0, 12));
    aes.setAuthTag(bytes.subarray(-16));
    return new Uint8Array(Buffer.concat([aes.update(bytes.subarray(12, -16)), aes.final()]));
  },
};

function stores() {
  const keychain = { value: null, writes: 0 };
  const table = new Map();
  return {
    keychain,
    table,
    keys: { get: async () => keychain.value, set: async (value) => { keychain.value = value; keychain.writes += 1; } },
    values: {
      get: async (name) => table.get(name) ?? null,
      set: async (name, value) => { table.set(name, value); },
      remove: async (name) => { table.delete(name); },
    },
  };
}

const session = JSON.stringify({ access_token: 'eyJ.access', refresh_token: 'refresh', user: { email: 'çağrı@örnek.com' } });

test('a session is stored sealed, never as plain text, and reads back whole', async () => {
  const { keys, table, values } = stores();
  const storage = createEncryptedSessionStorage({ keys, values, cipher });
  await storage.setItem('sb-session', session);
  const sealed = table.get('sb-session');
  assert.equal(sealed.includes('refresh'), false);
  assert.equal(sealed.includes('eyJ'), false);
  assert.equal(await storage.getItem('sb-session'), session);
  await storage.removeItem('sb-session');
  assert.equal(await storage.getItem('sb-session'), null);
});

test('a missing key (a restored or reinstalled phone) or a missing value reads as signed out', async () => {
  const { keychain, keys, values } = stores();
  const storage = createEncryptedSessionStorage({ keys, values, cipher });
  assert.equal(await storage.getItem('sb-session'), null);
  await storage.setItem('sb-session', session);
  keychain.value = null;
  assert.equal(await storage.getItem('sb-session'), null);
});

test('a value sealed under another key, or tampered with, reads as signed out', async () => {
  const { keychain, keys, table, values } = stores();
  const storage = createEncryptedSessionStorage({ keys, values, cipher });
  await storage.setItem('sb-session', session);
  keychain.value = await cipher.newKey();
  assert.equal(await storage.getItem('sb-session'), null);
  table.set('sb-session', 'not sealed at all');
  assert.equal(await storage.getItem('sb-session'), null);
});

test('concurrent first writes create one key, so neither value is lost to a second key', async () => {
  const { keychain, keys, values } = stores();
  const storage = createEncryptedSessionStorage({ keys, values, cipher });
  await Promise.all([storage.setItem('a', 'one'), storage.setItem('b', 'two')]);
  assert.equal(keychain.writes, 1);
  assert.deepEqual([await storage.getItem('a'), await storage.getItem('b')], ['one', 'two']);
});

test('UTF-8 conversion matches the platform encoder both ways', () => {
  for (const text of ['', 'plain', 'Gardırop ğüşiöç', 'emoji 👗', session]) {
    assert.deepEqual(utf8Bytes(text), new TextEncoder().encode(text));
    assert.equal(utf8Text(new TextEncoder().encode(text)), text);
  }
  assert.throws(() => utf8Text(Uint8Array.from([0xff, 0xfe])));
});
