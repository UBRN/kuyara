import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPercentage } from './format-percentage.ts';

test('a ratio reads as a whole percentage, the sign where each language puts it', () => {
  assert.equal(formatPercentage(0.2, 'en'), '20%');
  assert.equal(formatPercentage(0.2, 'tr'), '%20');
  assert.equal(formatPercentage(0.456, 'en'), '46%');
  assert.equal(formatPercentage(0, 'en'), '0%');
  assert.equal(formatPercentage(1, 'tr'), '%100');
});
