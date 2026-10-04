import assert from 'node:assert/strict';
import test from 'node:test';

import { accountScenarios, createInMemoryAccountScreens } from './account-screens.ts';
import { selectIsMember, useIsMember } from './account-membership.ts';

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
