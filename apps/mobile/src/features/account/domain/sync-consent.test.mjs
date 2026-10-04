import assert from 'node:assert/strict';
import test from 'node:test';

import { givenConsentRecordedAt, latestWithdrawnRecordedAt, syncConsentState } from './sync-consent.ts';

const record = (answer, answeredAt, recordedAt = answeredAt) => ({ answer, textVersion: '2026-10-04', answeredAt, recordedAt });

test('an account without an answer has no consent', () => {
  assert.equal(syncConsentState([]), 'none');
});

test('the latest answer to arrive wins, whatever a phone clock wrote into it', () => {
  assert.equal(syncConsentState([record('given', '2026-10-04T10:00:00Z')]), 'given');
  assert.equal(syncConsentState([record('given', '2026-10-04T10:00:00Z'), record('withdrawn', '2026-10-04T11:00:00Z')]), 'withdrawn');
  // A phone with a slow clock gave it again after the withdrawal arrived.
  assert.equal(syncConsentState([record('withdrawn', '2026-10-04T11:00:00Z'), record('given', '2026-10-04T09:00:00Z')]), 'given');
});

test('the records sync under the latest answer\'s arrival while it is given, and under none otherwise', () => {
  assert.equal(givenConsentRecordedAt([]), null);
  assert.equal(givenConsentRecordedAt([record('given', 'a', 'r1')]), 'r1');
  assert.equal(givenConsentRecordedAt([record('given', 'a', 'r1'), record('withdrawn', 'b', 'r2')]), null);
  assert.equal(givenConsentRecordedAt([record('given', 'a', 'r1'), record('withdrawn', 'b', 'r2'), record('given', 'c', 'r3')]), 'r3');
});

test('the latest withdrawal\'s arrival is what makes joined records link again, and a given never is', () => {
  assert.equal(latestWithdrawnRecordedAt([]), null);
  assert.equal(latestWithdrawnRecordedAt([record('given', 'a', 'r1'), record('given', 'b', 'r2')]), null);
  assert.equal(latestWithdrawnRecordedAt([record('given', 'a', 'r1'), record('withdrawn', 'b', 'r2'), record('given', 'c', 'r3')]), 'r2');
  assert.equal(latestWithdrawnRecordedAt([record('withdrawn', 'a', 'r1'), record('given', 'b', 'r2'), record('withdrawn', 'c', 'r3')]), 'r3');
});
