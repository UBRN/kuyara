import assert from 'node:assert/strict';
import test from 'node:test';

import {
  failureCategories,
  failureCategoryFromErrorKind,
} from './failure-category.ts';

test('the shared classification is exactly the four values features can distinguish', () => {
  assert.deepEqual([...failureCategories], [
    'offline',
    'unavailable',
    'rate-limited',
    'unknown',
  ]);
});

test('only the two shared kind names map away from unavailable', () => {
  assert.equal(failureCategoryFromErrorKind('network'), 'offline');
  assert.equal(failureCategoryFromErrorKind('rate-limited'), 'rate-limited');
  for (const kind of ['service', 'invalid-response', 'invalid-request', 'invalid-data', 'not-found', 'unavailable']) {
    assert.equal(failureCategoryFromErrorKind(kind), 'unavailable');
  }
});

test('an inherited property name is not mistaken for a category', () => {
  // The kind is read off a thrown value, so an object lookup would answer this one.
  assert.equal(failureCategoryFromErrorKind('constructor'), 'unavailable');
});
