import assert from 'node:assert/strict';
import test from 'node:test';

import { afterAccountDeletion, signIn, signOut, unlinked } from './account-link.ts';

const cursor = '2026-09-30T10:00:00.000000Z';

test('a fresh phone is unlinked, with no last account and no cursor', () => {
  assert.deepEqual(unlinked, { userId: null, lastUserId: null, cursor: null });
});

test('the first sign-in links the phone and starts with a merge from the beginning', () => {
  assert.deepEqual(signIn(unlinked, 'user-a'), {
    link: { userId: 'user-a', lastUserId: 'user-a', cursor: null },
    sync: 'first-link',
  });
});

test('signing out keeps the last account and the cursor and only drops the current link', () => {
  const linked = { userId: 'user-a', lastUserId: 'user-a', cursor };
  assert.deepEqual(signOut(linked), { userId: null, lastUserId: 'user-a', cursor });
});

test('signing back in with the same account resumes from the cursor, silently', () => {
  const out = signOut({ userId: 'user-a', lastUserId: 'user-a', cursor });
  assert.deepEqual(signIn(out, 'user-a'), {
    link: { userId: 'user-a', lastUserId: 'user-a', cursor },
    sync: 'resume',
  });
});

test('a different account merges this phone from the beginning, exactly as a first link does', () => {
  const out = signOut({ userId: 'user-a', lastUserId: 'user-a', cursor });
  assert.deepEqual(signIn(out, 'user-b'), {
    link: { userId: 'user-b', lastUserId: 'user-b', cursor: null },
    sync: 'first-link',
  });
  assert.deepEqual(signIn(out, 'user-b'), signIn(unlinked, 'user-b'));
});

test('deletion clears the link, the last account, the cursor and the pending flags', () => {
  assert.deepEqual(afterAccountDeletion(), { link: unlinked, resetPendingFlags: true });
});

test('after a deletion even the same account links as a first link again', () => {
  const { link } = afterAccountDeletion();
  assert.equal(signIn(link, 'user-a').sync, 'first-link');
});
