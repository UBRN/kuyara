import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewRequestDue, reviewRequestMinimumDays } from './domain/review-request.ts';
import { reviewRequestVersion } from '../profile/domain/profile.ts';

const createdAt = '2026-10-01T09:00:00.000Z';
const dayMs = 24 * 60 * 60 * 1000;
const created = Date.parse(createdAt);
const ready = Object.freeze({
  onboardingCompleted: true, analyticsConsent: 'granted', createdAt, reviewRequestVersion: 0,
});

test('the rating may be requested once the profile is three days old, not a moment sooner', () => {
  assert.equal(reviewRequestMinimumDays, 3);
  assert.equal(reviewRequestDue(ready, created + 3 * dayMs - 1), false);
  assert.equal(reviewRequestDue(ready, created + 3 * dayMs), true);
  assert.equal(reviewRequestDue(ready, created + 40 * dayMs), true);
});

test('a requested prompt version is never requested again; an older stored version is', () => {
  const later = created + 10 * dayMs;
  assert.equal(reviewRequestDue({ ...ready, reviewRequestVersion }, later), false);
  assert.equal(reviewRequestDue({ ...ready, reviewRequestVersion: reviewRequestVersion + 1 }, later), false);
  assert.equal(reviewRequestDue({ ...ready, reviewRequestVersion: undefined }, later), true);
});

test('unfinished onboarding, an unanswered consent sheet or an unreadable date rule the request out', () => {
  const later = created + 10 * dayMs;
  assert.equal(reviewRequestDue({ ...ready, onboardingCompleted: false }, later), false);
  assert.equal(reviewRequestDue({ ...ready, analyticsConsent: 'undecided' }, later), false);
  assert.equal(reviewRequestDue({ ...ready, analyticsConsent: 'withdrawn' }, later), true);
  assert.equal(reviewRequestDue({ ...ready, createdAt: 'not a date' }, later), false);
  assert.equal(reviewRequestDue(ready, created - dayMs), false);
});
