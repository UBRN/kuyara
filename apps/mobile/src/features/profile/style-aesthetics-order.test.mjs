import assert from 'node:assert/strict';
import test from 'node:test';

import { orderStyleAesthetics, sortedStyleAesthetics } from './domain/profile.ts';

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
