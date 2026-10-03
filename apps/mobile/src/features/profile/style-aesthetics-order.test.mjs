import assert from 'node:assert/strict';
import test from 'node:test';

import { orderStyleAesthetics, sameStyleAesthetics, sortedStyleAesthetics, styleAestheticsSchema } from './domain/profile.ts';

test('a style-aesthetics list is ordered alphabetically as a copy', () => {
  const chosen = ['sporty', 'classic', 'minimal'];

  assert.deepEqual(orderStyleAesthetics(chosen), ['classic', 'minimal', 'sporty']);
  assert.deepEqual(chosen, ['sporty', 'classic', 'minimal'], 'the input is not reordered');
  assert.deepEqual(orderStyleAesthetics([]), []);
});

test('a stored list is read in that order, and an invalid one reads as none', () => {
  assert.deepEqual(sortedStyleAesthetics(['sporty', 'classic']), ['classic', 'sporty']);
  assert.deepEqual(sortedStyleAesthetics(['classic', 'classic']), [], 'duplicates');
  assert.deepEqual(sortedStyleAesthetics(['classic', 'minimal', 'sporty', 'relaxed']), [], 'more than three');
  assert.deepEqual(sortedStyleAesthetics('classic'), [], 'not a list');
});

test('two style lists are the same when they hold the same styles in any order', () => {
  assert.equal(sameStyleAesthetics(['classic', 'minimal'], ['minimal', 'classic']), true);
  assert.equal(sameStyleAesthetics(undefined, []), true);
  assert.equal(sameStyleAesthetics(null, undefined), true);
  assert.equal(sameStyleAesthetics(['classic'], ['minimal']), false);
  assert.equal(sameStyleAesthetics(['classic'], []), false);
});

test('the profile styles accept at most the contract limit, unique, in any order', () => {
  assert.equal(styleAestheticsSchema.safeParse(['sporty', 'classic', 'minimal']).success, true);
  assert.equal(styleAestheticsSchema.safeParse(['classic', 'minimal', 'sporty', 'relaxed']).success, false);
  assert.equal(styleAestheticsSchema.safeParse(['classic', 'classic']).success, false);
});
