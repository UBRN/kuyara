import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewRequestDue } from './domain/review-request.ts';

// The cold launch is open 0; each return that plays the launch is the next open.
const clear = Object.freeze({
  ios: true, onboardingCompleted: true, open: 0, requestedOpen: null, presentationHeld: false, active: true,
});

test('the first open after onboarding asks once nothing is presented over it', () => {
  assert.equal(reviewRequestDue(clear), true);
  assert.equal(reviewRequestDue({ ...clear, onboardingCompleted: false }), false);
});

test('every open asks once: a later cold launch and a return that plays the launch ask again', () => {
  assert.equal(reviewRequestDue({ ...clear, requestedOpen: 0 }), false);
  // A later cold launch is a new process, which has asked in no open yet.
  assert.equal(reviewRequestDue({ ...clear, requestedOpen: null }), true);
  assert.equal(reviewRequestDue({ ...clear, open: 1, requestedOpen: 0 }), true);
  assert.equal(reviewRequestDue({ ...clear, open: 1, requestedOpen: 1 }), false);
});

test('nothing is asked while something is presented or the app is not active, nor ever off iOS', () => {
  assert.equal(reviewRequestDue({ ...clear, presentationHeld: true }), false);
  assert.equal(reviewRequestDue({ ...clear, active: false }), false);
  assert.equal(reviewRequestDue({ ...clear, ios: false }), false);
});
