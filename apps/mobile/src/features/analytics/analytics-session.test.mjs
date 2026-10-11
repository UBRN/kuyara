import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nextSessionIndex,
  sessionMayAskForConsent,
} from './domain/analytics-session.ts';

test('a launch with no record starts the first session', () => {
  assert.equal(nextSessionIndex(null), 1);
});

test('a launch after a recorded session starts the next one', () => {
  assert.equal(nextSessionIndex('1'), 2);
  assert.equal(nextSessionIndex('7'), 8);
});

test('an unreadable record is read as no earlier session', () => {
  assert.equal(nextSessionIndex(''), 1);
  assert.equal(nextSessionIndex('two'), 1);
  assert.equal(nextSessionIndex('-3'), 1);
  assert.equal(nextSessionIndex('0'), 1);
  assert.equal(nextSessionIndex('1.5'), 2);
});

// ADR 0033 section 6: the Today sheet, for a profile that finished onboarding unanswered,
// leaves the first session to the first recommendation.
test('the Today sheet may ask from the second session onwards, never on the first', () => {
  assert.equal(sessionMayAskForConsent(1), false);
  assert.equal(sessionMayAskForConsent(2), true);
  assert.equal(sessionMayAskForConsent(9), true);
});
