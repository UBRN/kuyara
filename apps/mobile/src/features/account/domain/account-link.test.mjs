import assert from 'node:assert/strict';
import test from 'node:test';

import { afterAccountDeletion, signIn, signOut, unlinked } from './account-link.ts';

const cursor = '2026-09-30T10:00:00.000000Z';

test('a fresh phone is unlinked, with no last account and no cursor', () => {
  assert.deepEqual(unlinked, { userId: null, lastUserId: null, cursor: null });
});

test('the first sign-in links the phone and starts with a merge from the beginning', () => {
  assert.deepEqual(signIn(unlinked, 'user-a', 0, null), {
    kind: 'linked',
    link: { userId: 'user-a', lastUserId: 'user-a', cursor: null },
    sync: 'first-link',
    previousRows: 'keep',
  });
});

test('signing out keeps the last account and the cursor and only drops the current link', () => {
  const linked = { userId: 'user-a', lastUserId: 'user-a', cursor };
  assert.deepEqual(signOut(linked), { userId: null, lastUserId: 'user-a', cursor });
});

test('signing back in with the same account resumes from the cursor, silently', () => {
  const out = signOut({ userId: 'user-a', lastUserId: 'user-a', cursor });
  assert.deepEqual(signIn(out, 'user-a', 4, null), {
    kind: 'linked',
    link: { userId: 'user-a', lastUserId: 'user-a', cursor },
    sync: 'resume',
    previousRows: 'keep',
  });
});

test('a different account asks first, stating the pending changes, and changes nothing yet', () => {
  const out = signOut({ userId: 'user-a', lastUserId: 'user-a', cursor });
  assert.deepEqual(signIn(out, 'user-b', 3, null), { kind: 'choose-for-previous-rows', pendingCount: 3 });
  assert.deepEqual(signIn(out, 'user-b', 0, null), { kind: 'choose-for-previous-rows', pendingCount: 0 });
});

test('adding the previous rows keeps them and merges from the beginning under the new account', () => {
  const out = signOut({ userId: 'user-a', lastUserId: 'user-a', cursor });
  assert.deepEqual(signIn(out, 'user-b', 3, 'add'), {
    kind: 'linked',
    link: { userId: 'user-b', lastUserId: 'user-b', cursor: null },
    sync: 'first-link',
    previousRows: 'keep',
  });
});

test('not adding them removes the previous rows on the phone and pulls the new account from the beginning', () => {
  const out = signOut({ userId: 'user-a', lastUserId: 'user-a', cursor });
  assert.deepEqual(signIn(out, 'user-b', 3, 'dont-add'), {
    kind: 'linked',
    link: { userId: 'user-b', lastUserId: 'user-b', cursor: null },
    sync: 'first-link',
    previousRows: 'remove',
  });
});

test('deletion clears the link, the last account, the cursor and the pending flags', () => {
  assert.deepEqual(afterAccountDeletion(), { link: unlinked, resetPendingFlags: true });
});

test('after a deletion even the same account links as a first link again', () => {
  const { link } = afterAccountDeletion();
  assert.equal(signIn(link, 'user-a', 0, null).sync, 'first-link');
});
