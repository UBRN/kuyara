import assert from 'node:assert/strict';
import test from 'node:test';

import { uvLevelOf } from './uv-level.ts';

test('a UV index falls in the WHO band of its whole value', () => {
  assert.deepEqual(
    [0.4, 2.4, 2.5, 5.4, 5.5, 7.4, 7.5, 10.4, 10.5, 14].map(uvLevelOf),
    ['low', 'low', 'moderate', 'moderate', 'high', 'high', 'veryHigh', 'veryHigh', 'extreme', 'extreme'],
  );
});
