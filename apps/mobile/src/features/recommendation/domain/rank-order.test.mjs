import assert from 'node:assert/strict';
import test from 'node:test';

import { uniqueInRankOrder } from './rank-order.ts';

test('values come back distinct, in rank order, unranked values last', () => {
  const rank = new Map([['b', 0], ['a', 1]]);

  assert.deepEqual(uniqueInRankOrder(['a', 'zz', 'b', 'a'], rank), ['b', 'a', 'zz']);
  assert.ok(Object.isFrozen(uniqueInRankOrder([], rank)));
});
