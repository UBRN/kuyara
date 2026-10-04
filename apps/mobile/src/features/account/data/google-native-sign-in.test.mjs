import assert from 'node:assert/strict';
import test from 'node:test';

import { createGoogleSignIn, resolveGoogleSignInSettings } from './google-native-sign-in.ts';

const webClientId = '123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com';
const iosClientId = '123456789012-zyxwvutsrqponmlkjihgfedcba543210.apps.googleusercontent.com';

test('the Google client settings need both public client ids in Google\'s format, else Google stays off', () => {
  assert.deepEqual(resolveGoogleSignInSettings(webClientId, iosClientId), { webClientId, iosClientId });
  assert.deepEqual(resolveGoogleSignInSettings(` ${webClientId} `, iosClientId), { webClientId, iosClientId });
  for (const [web, ios] of [[undefined, iosClientId], [webClientId, undefined], ['', iosClientId],
    ['not-a-client-id', iosClientId], [webClientId, 'GOCSPX-secret'], ['autoDetect', iosClientId]]) {
    assert.equal(resolveGoogleSignInSettings(web, ios), null, `${web} ${ios}`);
  }
});

function module(answer) {
  const calls = [];
  return {
    calls,
    configure: (params) => calls.push(['configure', params]),
    authenticate: async (params) => { calls.push(['authenticate', params]); return answer(); },
  };
}

test('the wrapper configures the openid, email and profile scopes once and sends the hashed nonce', async () => {
  const native = module(() => ({ type: 'success', data: { idToken: 'google-id-token', user: { name: 'Never Read' } } }));
  const wrapper = createGoogleSignIn(native, { webClientId, iosClientId });
  assert.deepEqual(await wrapper.idToken('hashed'), { idToken: 'google-id-token' });
  await wrapper.idToken('hashed-2');
  assert.deepEqual(native.calls, [
    ['configure', { webClientId, iosClientId, scopes: ['openid', 'email', 'profile'] }],
    ['authenticate', { nonce: 'hashed' }],
    ['authenticate', { nonce: 'hashed-2' }],
  ]);
});

test('a cancel is null, and an answer without an ID token or of another kind is a failure', async () => {
  assert.equal(await createGoogleSignIn(module(() => ({ type: 'cancelled', data: null })), { webClientId, iosClientId }).idToken('h'), null);
  for (const answer of [{ type: 'success', data: { idToken: null } }, { type: 'noSavedCredentialFound', data: null }]) {
    await assert.rejects(createGoogleSignIn(module(() => answer), { webClientId, iosClientId }).idToken('h'));
  }
});
