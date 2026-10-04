import assert from 'node:assert/strict';
import test from 'node:test';

import { accountScenarios, createInMemoryAccountScreens } from './account-screens.ts';
import {
  memberAccessToken,
  provideMemberAccess,
  selectIsMember,
  useIsMember,
} from './account-membership.ts';

test('a signed-in session is a member and nothing else is', async () => {
  const port = createInMemoryAccountScreens();
  assert.equal(selectIsMember(port.getSnapshot()), false);
  await port.signIn('apple');
  assert.equal(selectIsMember(port.getSnapshot()), true);
  await port.signOut();
  assert.equal(selectIsMember(port.getSnapshot()), false);
});

test('every scenario answers by its session kind alone', () => {
  for (const [name, snapshot] of Object.entries(accountScenarios)) {
    assert.equal(selectIsMember(snapshot), snapshot.session.kind === 'signedIn', name);
  }
  assert.ok(Object.values(accountScenarios).some(selectIsMember));
  assert.ok(Object.values(accountScenarios).some((snapshot) => !selectIsMember(snapshot)));
});

test('a deleted or signed-out notice is not a member, and a failed sync does not end membership', () => {
  assert.equal(selectIsMember(accountScenarios.deletedNotice), false);
  assert.equal(selectIsMember(accountScenarios.signedOutNotice), false);
  assert.equal(selectIsMember(accountScenarios.deleteFailed), true);
});

test('the component hook is the selector read through the account screens port', () => {
  assert.equal(typeof useIsMember, 'function');
});

test('without a live session no token exists', async () => {
  assert.equal(await memberAccessToken(), null);
});

test('the live session answers membership, and gives its token only while signed in', async (t) => {
  const port = createInMemoryAccountScreens();
  let reads = 0;
  const stop = provideMemberAccess({ port, accessToken: async () => { reads += 1; return 'access-token'; } });
  t.after(stop);
  assert.equal(await memberAccessToken(), null);
  assert.equal(reads, 0);
  await port.signIn('apple');
  assert.equal(await memberAccessToken(), 'access-token');
  await port.signOut();
  assert.equal(await memberAccessToken(), null);
  assert.equal(reads, 1);
});

test('a token that cannot be read is none, and a stopped session no longer answers', async () => {
  const port = createInMemoryAccountScreens(accountScenarios.upToDate);
  let token = async () => { throw new Error('No session.'); };
  const stop = provideMemberAccess({ port, accessToken: () => token() });
  assert.equal(await memberAccessToken(), null);
  token = async () => 'access-token';
  assert.equal(await memberAccessToken(), 'access-token');
  stop();
  assert.equal(await memberAccessToken(), null);
});
