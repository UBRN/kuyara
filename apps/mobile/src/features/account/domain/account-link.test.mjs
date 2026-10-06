import assert from 'node:assert/strict';
import test from 'node:test';

import {
  linkAfterFirstLink, linkAtPass, signOut, syncPassFor, unlinked,
} from './account-link.ts';
import { pullCursorAt } from './sync-rules.ts';

const cursor = '2026-09-30T10:00:00.000000Z';
const givenAt = '2026-09-29T08:00:00.000001Z';
const withdrawnAt = '2026-09-29T09:00:00.000001Z';
const givenAgainAt = '2026-10-02T08:00:00.000001Z';

test('a fresh phone is unlinked, with no last account, no joined records and no cursor', () => {
  assert.deepEqual(unlinked, { userId: null, lastUserId: null, recordsUserId: null, recordsConsentRecordedAt: null, cursor: pullCursorAt(null) });
});

const joined = { userId: 'user-a', lastUserId: 'user-a', recordsUserId: 'user-a', recordsConsentRecordedAt: givenAt, cursor };

test('signing out keeps the last account, the joined records and the cursor and only drops the current link', () => {
  assert.deepEqual(signOut(joined), { ...joined, userId: null });
});

test('with the consent, a phone whose records have not joined this account takes a first link', () => {
  assert.equal(syncPassFor(unlinked, 'user-a', true, null), 'first-link');
  assert.equal(syncPassFor({ ...joined, recordsUserId: null }, 'user-a', true, null), 'first-link');
  assert.equal(syncPassFor(signOut(joined), 'user-b', true, null), 'first-link');
});

test('signing back in with the same account under the consent resumes from the cursor, silently', () => {
  assert.equal(syncPassFor(signOut(joined), 'user-a', true, null), 'sync');
});

test('a consent withdrawn and given again while the phone was away links the records again', () => {
  assert.equal(syncPassFor(joined, 'user-a', true, withdrawnAt), 'first-link');
  assert.equal(syncPassFor({ ...joined, recordsConsentRecordedAt: null }, 'user-a', true, null), 'first-link');
  assert.deepEqual(linkAfterFirstLink(joined, 'user-a', true, 'next', givenAgainAt),
    { ...joined, recordsConsentRecordedAt: givenAgainAt, cursor: 'next' });
  assert.equal(syncPassFor(linkAfterFirstLink(joined, 'user-a', true, 'next', givenAgainAt), 'user-a', true, withdrawnAt), 'sync');
});

test('a redundant later given with no withdrawal after the joining one resumes, a withdrawal before it too', () => {
  assert.equal(syncPassFor(joined, 'user-a', true, null), 'sync');
  assert.equal(syncPassFor(joined, 'user-a', true, '2026-09-29T07:00:00.000001Z'), 'sync');
  assert.equal(syncPassFor(joined, 'user-a', true, givenAt), 'sync');
});

test('signing back in with the same account without the consent resumes too, so a pending name edit uploads', () => {
  const declined = signOut({ userId: 'user-a', lastUserId: 'user-a', recordsUserId: null, recordsConsentRecordedAt: null, cursor });
  assert.equal(syncPassFor(declined, 'user-a', false, null), 'sync');
  assert.equal(syncPassFor(declined, 'user-b', false, null), 'first-link');
  assert.equal(syncPassFor(unlinked, 'user-a', false, null), 'first-link');
});

test('any first link sets the last account; only one under the consent joins the records', () => {
  const before = { ...joined, userId: null };
  assert.deepEqual(linkAfterFirstLink(before, 'user-b', true, 'next', givenAgainAt),
    { userId: 'user-b', lastUserId: 'user-b', recordsUserId: 'user-b', recordsConsentRecordedAt: givenAgainAt, cursor: 'next' });
  assert.deepEqual(linkAfterFirstLink(before, 'user-b', false, 'next', null),
    { userId: 'user-b', lastUserId: 'user-b', recordsUserId: 'user-a', recordsConsentRecordedAt: givenAt, cursor: 'next' });
});

test('without the consent the records no longer count as joined, so the next consent links them again', () => {
  const left = linkAtPass(joined, 'user-a', false);
  assert.deepEqual(left, { ...joined, recordsUserId: null, recordsConsentRecordedAt: null });
  assert.equal(syncPassFor(left, 'user-a', true, null), 'first-link');
  assert.equal(syncPassFor(left, 'user-a', false, null), 'sync');
  assert.equal(linkAtPass(joined, 'user-a', true), joined);
});

test('a pass relinks a signed-out link to the signed-in account and keeps what it holds', () => {
  assert.deepEqual(linkAtPass(signOut(joined), 'user-a', true), joined);
  assert.deepEqual(linkAtPass(signOut(joined), 'user-b', false), { ...joined, userId: 'user-b' });
});

test('after a deletion, which saves the link unlinked, even the same account links as a first link again', () => {
  assert.equal(syncPassFor(unlinked, 'user-a', true, null), 'first-link');
  assert.equal(syncPassFor(unlinked, 'user-a', false, null), 'first-link');
});

test('under the consent, an account other than the last linked one takes a first link from its own cursor', () => {
  const afterA = signOut(linkAfterFirstLink(unlinked, 'user-a', true, cursor, givenAt));
  const afterB = signOut(linkAfterFirstLink(linkAtPass(afterA, 'user-b', false), 'user-b', false, 'b-cursor', null));
  const back = linkAtPass(afterB, 'user-a', true);
  assert.equal(syncPassFor(back, 'user-a', true, null), 'first-link');
  const relinked = linkAfterFirstLink(back, 'user-a', true, 'a-cursor', givenAt);
  assert.equal(relinked.lastUserId, 'user-a');
  assert.equal(relinked.cursor, 'a-cursor');
  assert.equal(syncPassFor(relinked, 'user-a', true, null), 'sync');
});
